const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors'); // Import cors
const crypto = require('crypto'); // For generating secure tokens

const app = express();
const server = http.createServer(app);

// Configure CORS
app.use(cors({
  origin: "http://localhost:5173", // Allow your Vite dev server
  methods: ["GET", "POST"]
}));

// Express middleware for parsing JSON
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // Allow your Vite dev server
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000, // Increase ping timeout
  pingInterval: 25000 // Ensure pings are sent
});

const connectedUsers = new Map(); // Stores { id: socket.id, username: string, color: '#RRGGBB' }
const registeredUsers = new Map(); // In-memory storage for users - would be replaced with a database in production

// Helper function to generate a random hex color
function getRandomColor() {
  return '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
}

// Generate a secure token
function generateToken() {
  return crypto.randomBytes(64).toString('hex');
}

app.get('/', (req, res) => {
  res.send('<h1>Real-time Collaboration Server</h1>');
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  // Add user with temporary ID for now, will be updated on login/register
  const userColor = getRandomColor();
  connectedUsers.set(socket.id, { id: socket.id, username: `Guest-${socket.id.substring(0, 5)}`, color: userColor });

  // Register a new user
  socket.on('register', (userData, callback) => {
    const { username, email, password, color } = userData;
    
    // Check if username already exists
    const existingUser = Array.from(registeredUsers.values()).find(user => user.username === username);
    if (existingUser) {
      return callback({ success: false, error: 'Username already exists' });
    }
    
    // Create a new user
    const userId = socket.id;
    const userColor = color || getRandomColor();
    const token = generateToken();
    
    const newUser = {
      id: userId,
      username,
      email,
      color: userColor,
      token
    };
    
    // In production, you would hash the password before storing
    registeredUsers.set(username, { ...newUser, password });
    
    // Update the connected user entry
    connectedUsers.set(socket.id, newUser);
    
    // Broadcast updated user list
    io.emit('user-list-updated', Array.from(connectedUsers.values()));
    
    callback({ success: true, user: newUser });
  });
  
  // Login an existing user
  socket.on('login', (userData, callback) => {
    const { username, password } = userData;
    
    // Check if user exists
    const user = registeredUsers.get(username);
    if (!user) {
      return callback({ success: false, error: 'Invalid username or password' });
    }
    
    // Check password
    if (user.password !== password) {
      return callback({ success: false, error: 'Invalid username or password' });
    }
    
    // Generate a new token
    const token = generateToken();
    const loggedInUser = { ...user, token, id: socket.id };
    
    // Update the user's data
    registeredUsers.set(username, { ...loggedInUser, password });
    
    // Update the connected user entry
    connectedUsers.set(socket.id, loggedInUser);
    
    // Broadcast updated user list
    io.emit('user-list-updated', Array.from(connectedUsers.values()));
    
    callback({ success: true, user: loggedInUser });
  });
  
  // Logout
  socket.on('logout', () => {
    // Just update the user to be anonymous, don't disconnect
    const userColor = getRandomColor();
    connectedUsers.set(socket.id, { id: socket.id, username: `Guest-${socket.id.substring(0, 5)}`, color: userColor });
    
    // Broadcast updated user list
    io.emit('user-list-updated', Array.from(connectedUsers.values()));
  });
  
  io.emit('user-list-updated', Array.from(connectedUsers.values())); // Broadcast updated list of user objects
  console.log('Connected users:', Array.from(connectedUsers.values()));

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    connectedUsers.delete(socket.id);
    io.emit('user-list-updated', Array.from(connectedUsers.values())); // Broadcast updated list
    console.log('Connected users:', Array.from(connectedUsers.values()));
    // Also notify other clients that this user's cursor should be removed
    socket.broadcast.emit('user-cursor-removed', { userId: socket.id });
  });

  // Listen for object movement from a client
  socket.on('object-moved', (data) => {
    console.log(`[Server] Received 'object-moved' from ${socket.id}:`, data);
    // Broadcast the updated object information to all other clients
    socket.broadcast.emit('object-updated', data);
    console.log(`[Server] Broadcasted 'object-updated' to other clients with data:`, data);
  });

  // Listen for object creation request from a client
  socket.on('request-create-object', (data) => {
    console.log(`[Server] Received 'request-create-object' from ${socket.id}:`, data);
    // Broadcast the new object information to all clients
    io.emit('object-created', data); // Send to all clients, including sender
    console.log(`[Server] Broadcasted 'object-created' to all clients with data:`, data);
  });

  // Listen for object deletion request from a client
  socket.on('request-delete-object', (data) => {
    console.log(`[Server] Received 'request-delete-object' from ${socket.id}:`, data);
    // Broadcast the deleted object information to all other clients
    // We use io.emit here so the deleting client also receives confirmation and can handle any UI updates if necessary,
    // though primary deletion is handled client-side first for responsiveness.
    io.emit('object-deleted', { objectId: data.objectId }); 
    console.log(`[Server] Broadcasted 'object-deleted' to all clients for objectId:`, data.objectId);
  });

  // Listen for object property changes from a client
  socket.on('object-property-changed', (data) => {
    console.log(`[Server] Received 'object-property-changed' from ${socket.id}:`, data);
    // Broadcast the updated property to all other clients
    socket.broadcast.emit('object-property-updated', data);
    console.log(`[Server] Broadcasted 'object-property-updated' to other clients with data:`, data);
  });

  // Listen for cursor movement from a client
  socket.on('cursor-moved', (data) => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      socket.broadcast.emit('cursor-updated', {
        userId: socket.id,
        color: user.color,
        position: data.position 
      });
    }
  });

  // Handle user authentication from client
  socket.on('user-authenticated', (userData) => {
    console.log(`User authenticated: ${socket.id} as ${userData.username || 'Guest'}`);
    
    // Update user data in the connected users map
    const currentUser = connectedUsers.get(socket.id) || {};
    const updatedUserData = {
      ...currentUser,
      id: userData.id || socket.id,
      username: userData.username || `Guest-${socket.id.substring(0, 5)}`,
      color: userData.color || currentUser.color || getRandomColor()
    };
    
    connectedUsers.set(socket.id, updatedUserData);
    
    // Broadcast updated user list
    io.emit('user-list-updated', Array.from(connectedUsers.values()));
    console.log('Updated connected users:', Array.from(connectedUsers.values()));
  });

  // More event handlers will be added here
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on *:${PORT}`);
});
