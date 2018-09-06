import firebase from "firebase";

const config = {
  apiKey: "AIzaSyBonwpb7FRJ2BKM9FYhVDXGemWnQduk9vY",
  authDomain: "picture-notes-38f03.firebaseapp.com",
  databaseURL: "https://picture-notes-38f03.firebaseio.com",
  projectId: "picture-notes-38f03",
  storageBucket: "picture-notes-38f03.appspot.com",
  messagingSenderId: "864173368416"
};

firebase.initializeApp(config);

export const storage = firebase.storage();

export default firebase;
