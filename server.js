require('dotenv').config();
const express = require('express');
const serverless = require('serverless-http');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
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
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});

const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient);
const tableName = process.env.TABLE_NAME;

app.use(express.json());
app.use(limiter);
app.use(cors({
  origin: allowedOrigins,
  optionsSuccessStatus: 200,
  maxAge: 10,
}));

app.get('/api/todos', async (req, res) => {
  try {
    const result = await docClient.send(new ScanCommand({ TableName: tableName }));
    const sortedByTime = result.Items.sort((a, b) => a.createdAt - b.createdAt);
    res.json(sortedByTime);
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/todos/add', async (req, res) => {
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

app.delete('/api/todos/:id', async (req, res) => {
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

app.put('/api/todos/:id', async (req, res) => {
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

module.exports.handler = serverless(app);
