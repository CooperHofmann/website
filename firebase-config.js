/* ==========================================================================
   Firebase Configuration
   ==========================================================================
   Replace the placeholder values below with your actual Firebase project
   credentials. You can find these in the Firebase Console under:
   Project Settings → General → Your apps → SDK setup and configuration.

   To set up Firebase:
   1. Go to https://console.firebase.google.com/
   2. Create a new project (or use an existing one)
   3. Add a Web app to your project
   4. Enable Authentication → Sign-in method → Email/Password
   5. Enable Firestore Database (start in production mode)
   6. Copy your config values below
   7. In Firestore, set the following security rules:
      rules_version = '2';
      service cloud.firestore {
        match /databases/{database}/documents {
          match /userData/{userId}/{document=**} {
            allow read, write: if request.auth != null && request.auth.uid == userId;
          }
        }
      }
   ========================================================================== */

var firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
