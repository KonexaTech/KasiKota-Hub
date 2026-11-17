/* FCM web-push service worker for installed Android Chrome PWA.
   Native Capacitor APKs require a separate native FCM registration path. */
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");
firebase.initializeApp({
 apiKey:"AIzaSyCxaY076gfNUfE3OzxkDJZ5xAdmLEuJzgs",
 authDomain:"kasikota-hub.firebaseapp.com",
 projectId:"kasikota-hub",
 messagingSenderId:"470531130099",
 appId:"1:470531130099:web:1bf117b7adf7a3a3d7ed86"
});
firebase.messaging();
self.addEventListener("notificationclick",event=>{
 event.notification.close();
 event.waitUntil(clients.openWindow("./kota-connect-owners-dashboard-fixed.html"));
});
