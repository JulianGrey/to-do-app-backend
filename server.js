const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const allowedOrigins = ['http://localhost:5173'];

app.use(express.json());
app.use(cors({
  origin: allowedOrigins,
  optionsSuccessStatus: 200,
  maxAge: 10,
}));

app.get('/api/todos', (req, res) => {
  const todos = [
    {
      description: 'To Do Description',
      title: 'To Do Title',
    },
    {
      description: '',
      title: 'To Do Title 2',
    },
    {
      description: 'To Do Description 3',
      title: 'To Do Title 3',
    },
  ];

  res.json(todos);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
