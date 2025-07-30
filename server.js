require('dotenv').config();
const express = require('express');
const serverless = require('serverless-http');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');

const app = express();

// CORS configuration - ONLY for local development
// In production (AWS Lambda), CORS is handled by Lambda Function URL configuration
// This middleware will NOT run in production because NODE_ENV !== 'development'
if (process.env.NODE_ENV === 'development' && process.env.ALLOWED_ORIGINS) {
  const cors = require('cors');
  
  const corsOptions = {
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      const allowedOrigins = process.env.ALLOWED_ORIGINS.split(',');
        
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  };

  app.use(cors(corsOptions));
  console.log('🔧 Local CORS enabled for origins:', process.env.ALLOWED_ORIGINS);
} else {
  console.log('🚀 Production mode: CORS handled by Lambda Function URL');
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true,
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  keyGenerator: (req) => {
    return req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
  }
});

const ddbClient = new DynamoDBClient({ 
  region: process.env.AWS_REGION_CODE,
  ...(process.env.DYNAMODB_ENDPOINT && { endpoint: process.env.DYNAMODB_ENDPOINT })
});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const tableName = process.env.TABLE_NAME;

app.set('trust proxy', 1);
app.use(express.json());
app.use(limiter);

app.get('/', (req, res) => {
  res.status(200).json({ message: 'API is running' });
});

app.get('/api/', (req, res) => {
  res.status(200).json({ message: 'API is running' });
});

app.get('/api/to-dos', async (req, res) => {
  try {
    const result = await docClient.send(new ScanCommand({ TableName: tableName }));
    const sortedByTime = result.Items.sort((a, b) => a.createdAt - b.createdAt);
    res.json(sortedByTime);
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/to-dos/add', async (req, res) => {
  const { title, description } = req.body;

  if (!title || typeof title !== 'string' || title.length > 40) {
    return res.status(400).json({ error: 'Valid title is required (max 40 chars)' });
  }

  if (description && typeof description !== 'string') {
    return res.status(400).json({ error: 'Description must be a string' });
  }

  const id = uuidv4();
  const createdAt = Date.now();
  try {
    await docClient.send(new PutCommand({
      TableName: tableName,
      Item: { id, title, description, createdAt }
    }));
    res.status(201).json({ id, title, description, createdAt });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/to-dos/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await docClient.send(new DeleteCommand({
      TableName: tableName,
      Key: { id }
    }));

    res.json({ message: 'Todo deleted', todo: result.Attributes });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/to-dos/:id', async (req, res) => {
  const { id } = req.params;
  const { title, description } = req.body;

  try {
    const result = await docClient.send(new UpdateCommand({
      TableName: tableName,
      Key: { id },
      UpdateExpression: 'set title = :t, description = :d',
      ExpressionAttributeValues: {
        ':t': title,
        ':d': description
      },
      ReturnValues: 'ALL_NEW'
    }));

    res.json({ message: 'Todo updated', todo: result.Attributes });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// For local development
if (process.env.NODE_ENV !== 'production') {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

module.exports.handler = serverless(app);
