# Chess Coaching Website

A comprehensive chess coaching platform built with React, TypeScript, and Node.js. Features live game sessions, puzzle management, opening theory, and student progress tracking.

## 🚀 Features

### For Students
- **Live Chess Games**: Real-time games with coaches via Socket.IO
- **Puzzle Training**: Interactive chess puzzles with difficulty levels
- **Opening Theory**: Learn chess openings with detailed moves and commentary
- **Best Games Analysis**: Study famous chess games with highlights
- **Progress Tracking**: Monitor learning progress and achievements
- **Attendance System**: Track coaching sessions

### For Coaches/Admins
- **Student Management**: Manage student accounts and access permissions
- **Live Game Coaching**: Play and coach students in real-time
- **Content Management**: Create and manage puzzles, openings, and best games
- **Progress Analytics**: Track student performance and activity
- **Attendance Management**: Mark and track student attendance

## 🛠️ Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS** for styling
- **shadcn/ui** for UI components
- **React Router** for navigation
- **Socket.IO Client** for real-time communication

### Backend
- **Node.js** with Express
- **Socket.IO** for real-time games
- **MongoDB** with Mongoose
- **JWT** for authentication
- **bcryptjs** for password hashing

## 📁 Project Structure

```
├── src/
│   ├── components/          # Reusable UI components
│   ├── pages/              # Page components
│   ├── contexts/           # React contexts
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utilities and chess logic
│   └── services/           # API services
├── server/
│   ├── index.js            # Main server file
│   └── package.json        # Backend dependencies
├── public/                 # Static assets
└── dist/                   # Build output
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- MongoDB Atlas account (or local MongoDB)
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/kanuriharsha/chess_coaching_website.git
   cd chess_coaching_website
   ```

2. **Install frontend dependencies**
   ```bash
   npm install
   ```

3. **Install backend dependencies**
   ```bash
   cd server
   npm install
   cd ..
   ```

4. **Set up environment variables**

   Create `.env` in the root directory:
   ```env
   VITE_API_URL=http://localhost:5000
   ```

   Create `.env` in the `server` directory:
   ```env
   PORT=5000
   NODE_ENV=development
   MONGODB_URI=mongodb+srv://your-connection-string
   JWT_SECRET=your-jwt-secret-key
   ```

5. **Start the development servers**

   Terminal 1 - Backend:
   ```bash
   cd server
   npm start
   ```

   Terminal 2 - Frontend:
   ```bash
   npm run dev
   ```

6. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:5000

## 🔐 Default Users

After starting the server, these default users are created:
- **Admin**: username: `admin`, password: `admin`
- **Student**: username: `student`, password: `student`

## 🚀 Deployment

### Frontend (Vercel)
1. Connect your GitHub repository to Vercel
2. Set environment variable: `VITE_API_URL=https://your-backend-url.onrender.com`
3. Deploy automatically

### Backend (Render)
1. Connect your GitHub repository to Render
2. Set root directory to `server`
3. Add environment variables (see `.env.example`)
4. Deploy

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions.

## 🎯 Key Features

### Live Chess Games
- Real-time chess games between students and coaches
- One-to-one pairing enforcement
- Game timer with automatic time management
- Move validation and game state synchronization

### Content Management
- **Puzzles**: Categorized by difficulty (mate-in-1, mate-in-2, etc.)
- **Openings**: Chess opening theory with move sequences
- **Best Games**: Famous chess games with analysis
- **Access Control**: Permission-based content access

### User Management
- Role-based access (admin/student)
- User profiles and onboarding
- Attendance tracking
- Achievement system

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📧 Contact

For questions or support, please open an issue on GitHub.

---

**Happy Chess Learning! ♟️**
