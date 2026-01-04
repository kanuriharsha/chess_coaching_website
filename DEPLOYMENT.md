# Deployment Guide

This guide explains how to deploy the Chess Coaching Website with frontend on Vercel and backend on Render.

## 🚀 Backend Deployment (Render)

### 1. Push your code to GitHub (Already done!)
Your repository: https://github.com/kanuriharsha/chess_coaching_website

### 2. Create a Render Account
- Go to [render.com](https://render.com)
- Sign up or sign in with GitHub

### 3. Deploy Backend
1. Click **"New +"** → **"Web Service"**
2. Connect your GitHub repository: `kanuriharsha/chess_coaching_website`
3. Configure the service:
   - **Name**: `chess-coaching-backend` (or your preferred name)
   - **Region**: Choose closest to your users
   - **Branch**: `main`
   - **Root Directory**: `server`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
   - **Plan**: Free (or paid if you need)

4. **Add Environment Variables**:
   Click "Advanced" → "Add Environment Variable":
   ```
   PORT=5000
   NODE_ENV=production
   MONGODB_URI=mongodb+srv://harsha:harsha@cluster0.gwmwpwl.mongodb.net/harshachess
   JWT_SECRET=harshachess_jwt_secret_key_2024
   CORS_ORIGIN=https://your-app-name.vercel.app
   ```
   
   ⚠️ **Important**: Update `CORS_ORIGIN` with your actual Vercel URL after deploying frontend!

5. Click **"Create Web Service"**

6. Wait for deployment to complete. Your backend URL will be:
   ```
   https://chess-coaching-backend.onrender.com
   ```
   (or whatever name you chose)

---

## 🌐 Frontend Deployment (Vercel)

### 1. Create a Vercel Account
- Go to [vercel.com](https://vercel.com)
- Sign up or sign in with GitHub

### 2. Deploy Frontend
1. Click **"Add New..."** → **"Project"**
2. Import your GitHub repository: `kanuriharsha/chess_coaching_website`
3. Configure the project:
   - **Framework Preset**: Vite
   - **Root Directory**: `./` (leave as root)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

4. **Add Environment Variables**:
   Click "Environment Variables" and add:
   ```
   Name: VITE_API_URL
   Value: https://your-backend-name.onrender.com
   ```
   
   ⚠️ **Important**: Replace with your actual Render backend URL!

5. Click **"Deploy"**

6. Wait for deployment to complete. Your frontend URL will be:
   ```
   https://your-app-name.vercel.app
   ```

---

## 🔄 Update CORS After Deployment

After both are deployed:

1. **Copy your Vercel frontend URL**
2. **Go to Render Dashboard** → Your backend service → "Environment"
3. **Update the `CORS_ORIGIN` variable** with your Vercel URL:
   ```
   CORS_ORIGIN=https://your-actual-app.vercel.app
   ```
4. **Save changes** - Render will automatically redeploy

---

## ✅ Test Your Deployment

1. Visit your Vercel frontend URL
2. Try to login (default users if created):
   - Admin: `admin` / `admin`
   - Student: `student` / `student`
3. Test the live game functionality
4. Check browser console for any errors

---

## 🔧 Troubleshooting

### Frontend can't connect to backend
- ✅ Check that `VITE_API_URL` in Vercel matches your Render URL
- ✅ Check that `CORS_ORIGIN` in Render matches your Vercel URL
- ✅ Make sure both URLs use `https://` (not `http://`)

### Socket.IO connection fails
- ✅ Ensure WebSocket is enabled in Render (it is by default)
- ✅ Check CORS settings include your Vercel domain
- ✅ Verify browser console for connection errors

### MongoDB connection issues
- ✅ Verify `MONGODB_URI` environment variable in Render
- ✅ Check MongoDB Atlas allows connections from anywhere (0.0.0.0/0)
- ✅ View Render logs for connection errors

### Render free tier sleeps after inactivity
- Free tier services sleep after 15 minutes of inactivity
- First request after sleep takes ~30 seconds to wake up
- Consider upgrading to paid tier for production

---

## 📝 Environment Variables Summary

### Frontend (Vercel)
```env
VITE_API_URL=https://your-backend.onrender.com
```

### Backend (Render)
```env
PORT=5000
NODE_ENV=production
MONGODB_URI=mongodb+srv://harsha:harsha@cluster0.gwmwpwl.mongodb.net/harshachess
JWT_SECRET=harshachess_jwt_secret_key_2024
CORS_ORIGIN=https://your-app.vercel.app
```

---

## 🔐 Security Notes

⚠️ **Before going to production:**
1. Change the default JWT_SECRET to a strong random string
2. Create a new MongoDB user with a strong password
3. Update MongoDB to only allow connections from Render's IP ranges
4. Never commit `.env` files to git (already in .gitignore)

---

## 📊 Monitoring

- **Render Logs**: Dashboard → Your service → "Logs"
- **Vercel Logs**: Dashboard → Your project → "Deployments" → Select deployment → "View Function Logs"

---

## 🎉 You're Done!

Your chess coaching website should now be live and accessible worldwide!

**Frontend**: https://your-app-name.vercel.app  
**Backend**: https://your-backend-name.onrender.com
