// ==========================================
// 1. FIREBASE CONFIGURATION
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyBjyOOL1Y9qGzql_FWvYfjxGx1FukoUH0I",
    authDomain: "kvs-memories.firebaseapp.com",
    databaseURL: "https://kvs-memories-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "kvs-memories",
    storageBucket: "kvs-memories.firebasestorage.app",
    messagingSenderId: "62349854159",
    appId: "1:62349854159:web:0d26b214c54dcf00c5beba",
    measurementId: "G-WB76L4JGET"
};

// Initialize Firebase App
firebase.initializeApp(firebaseConfig);

// Initialize Services
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage(); // Added Firebase Storage

// GLOBALS
const STUDENT_EMAIL = "shaurya.vidyora@gmail.com";
let currentUserRole = null; 
let currentDateStr = new Date().toISOString().split('T')[0];
document.getElementById('date-picker').value = currentDateStr;
let unsubscribe = null;

// ==========================================
// 2. AUTHENTICATION & UI SETUP
// ==========================================
auth.onAuthStateChanged(user => {
    if (user) {
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');
        
        currentUserRole = (user.email.toLowerCase() === STUDENT_EMAIL) ? 'student' : 'mentor';
        document.getElementById('user-role-display').innerText = `Logged in as: ${currentUserRole.toUpperCase()}`;
        
        setupRoleUI();
        loadDateData();
    } else {
        document.getElementById('auth-screen').classList.remove('hidden');
        document.getElementById('dashboard').classList.add('hidden');
    }
});

async function login() {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    const errorP = document.getElementById('auth-error');
    try {
        try {
            await auth.signInWithEmailAndPassword(email, pass);
        } catch(e) {
            if(e.code === 'auth/user-not-found') {
                await auth.createUserWithEmailAndPassword(email, pass);
            } else throw e;
        }
    } catch(error) {
        errorP.innerText = error.message;
    }
}

function logout() { auth.signOut(); }

function setupRoleUI() {
    const isStudent = currentUserRole === 'student';
    
    document.getElementById('student-controls').classList.toggle('hidden', !isStudent);
    document.getElementById('upload-box').classList.toggle('hidden', !isStudent);
    document.getElementById('stats-input').disabled = !isStudent;
    document.getElementById('save-stats-btn').classList.toggle('hidden', !isStudent);
    
    document.getElementById('mentor-controls').classList.toggle('hidden', isStudent);
    document.getElementById('mentor-display').classList.toggle('hidden', !isStudent);
}

// ==========================================
// 3. DATABASE OPERATIONS (FIRESTORE)
// ==========================================
function loadDateData() {
    const dateVal = document.getElementById('date-picker').value;
    setupRoleUI(); 

    if(unsubscribe) unsubscribe(); 

    const docRef = db.collection('dailyLogs').doc(dateVal);
    
    unsubscribe = docRef.onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            renderTasks(data.tasks || []);
            renderImage(data.imageUrl);
            renderStats(data.stats);
            renderMentorFeedback(data.mentorFeedback);
        } else {
            renderTasks([]);
            renderImage(null);
            renderStats("");
            renderMentorFeedback("");
        }
    });
}

async function addTask() {
    if(currentUserRole !== 'student') return;
    
    const time = document.getElementById('task-time').value;
    const desc = document.getElementById('task-desc').value;
    if(!time || !desc) return alert("Fill time and description");

    const dateVal = document.getElementById('date-picker').value;
    const newTask = {
        id: Date.now().toString(),
        time: time, desc: desc,
        completed: false, completedAt: null
    };

    await db.collection('dailyLogs').doc(dateVal).set({
        tasks: firebase.firestore.FieldValue.arrayUnion(newTask)
    }, { merge: true });

    document.getElementById('task-desc').value = "";
}

async function toggleTask(taskId, currentStatus) {
    if(currentUserRole !== 'student') return;
    
    const dateVal = document.getElementById('date-picker').value;
    const docRef = db.collection('dailyLogs').doc(dateVal);
    const docSnap = await docRef.get();
    let tasks = docSnap.data().tasks;
    
    tasks = tasks.map(t => {
        if(t.id === taskId) {
            return {
                ...t, 
                completed: !currentStatus, 
                completedAt: !currentStatus ? new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : null 
            };
        }
        return t;
    });

    await docRef.update({ tasks: tasks });
}

async function saveStats() {
    const text = document.getElementById('stats-input').value;
    const dateVal = document.getElementById('date-picker').value;
    await db.collection('dailyLogs').doc(dateVal).set({ stats: text }, { merge: true });
}

async function saveMentorFeedback() {
    const text = document.getElementById('mentor-input').value;
    const dateVal = document.getElementById('date-picker').value;
    await db.collection('dailyLogs').doc(dateVal).set({ mentorFeedback: text }, { merge: true });
    document.getElementById('mentor-input').value = "";
}

// ==========================================
// 4. FIREBASE STORAGE IMAGE UPLOAD
// ==========================================
async function handleUpload(e) {
    const file = e.target.files[0];
    if(!file) return;

    const textEl = document.getElementById('upload-text');
    textEl.innerText = "Compressing...";
    
    try {
        // Compress the image before uploading to save Firebase Storage space
        const compressedBlob = await compressImage(file, 800, 0.7);
        textEl.innerText = "Uploading to Firebase...";
        
        const dateVal = document.getElementById('date-picker').value;
        const fileName = `daily_proofs/${dateVal}_${Date.now()}.jpg`;
        
        // Upload to Firebase Storage
        const storageRef = storage.ref().child(fileName);
        await storageRef.put(compressedBlob);
        
        // Get the downloadable URL
        const imgUrl = await storageRef.getDownloadURL();
        
        // Save the URL to Firestore database
        await db.collection('dailyLogs').doc(dateVal).set({ imageUrl: imgUrl }, { merge: true });
        
        textEl.innerText = "Uploaded successfully!";
        setTimeout(() => { textEl.innerText = "Click to upload image"; }, 2000);
    } catch(err) {
        console.error(err);
        alert("Upload failed: Check Firebase Storage Rules. " + err.message);
        textEl.innerText = "Upload Failed";
    }
}

function compressImage(file, maxWidth, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                let width = img.width, height = img.height;
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
                const canvas = document.createElement('canvas');
                canvas.width = width; canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
}

// ==========================================
// 5. RENDER FUNCTIONS
// ==========================================
function renderTasks(tasks) {
    const container = document.getElementById('task-list');
    container.innerHTML = '';
    tasks.sort((a,b) => a.time.localeCompare(b.time));

    tasks.forEach(task => {
        const div = document.createElement('div');
        div.className = `task-item ${task.completed ? 'task-done' : ''}`;
        const isStudent = currentUserRole === 'student';

        div.innerHTML = `
            <div class="task-info">
                <h4><span style="color:var(--primary)">${task.time}</span> - ${task.desc}</h4>
                <div class="task-meta">${task.completed ? `Done at ${task.completedAt}` : 'Pending'}</div>
            </div>
            ${isStudent ? `
                <input type="checkbox" style="width: 20px; height: 20px;" 
                    ${task.completed ? 'checked' : ''} 
                    onclick="toggleTask('${task.id}', ${task.completed})">
            ` : `
                <i class="ri-${task.completed ? 'checkbox-circle-fill' : 'time-line'}" 
                   style="color: var(--${task.completed ? 'success' : 'text-muted'}); font-size: 20px;"></i>
            `}
        `;
        container.appendChild(div);
    });

    if(tasks.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">No targets set for this day.</p>';
    }
}

function renderImage(url) {
    const img = document.getElementById('daily-image');
    if(url) {
        img.src = url; img.classList.remove('hidden');
    } else {
        img.src = ''; img.classList.add('hidden');
    }
}

function renderStats(text) {
    document.getElementById('stats-input').value = text || (currentUserRole === 'student' ? "" : "Student hasn't logged stats today.");
}

function renderMentorFeedback(text) {
    const display = document.getElementById('mentor-display');
    display.innerText = text || "No mentor feedback yet.";
    display.classList.remove('hidden');
}
