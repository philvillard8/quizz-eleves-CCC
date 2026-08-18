// --- CONFIGURATION SUPABASE ---
const SUPABASE_URL = "https://vphdknzbujxlvqfvqhnv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwaGRrbnpidWp4bHZxZnZxaG52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3Nzc3NjYsImV4cCI6MjEwMjM1Mzc2Nn0.S4-6jNDCBzxGgH8HLvnYrIfQCtGgNNz3IckrLA1gZv8";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- ÉTATS GLOBAUX ---
let sessionUsername = localStorage.getItem('quiz_username') || null; 
let sessionUserGroup = localStorage.getItem('quiz_usergroup') || null;
let activeQuizData = null;
let timerInterval = null;
let delayTimeout = null;

// --- SÉLECTEURS DOM ---
const authScreen = document.getElementById('auth-screen');
const quizSelectionScreen = document.getElementById('quiz-selection-screen');
const quizPlayScreen = document.getElementById('quiz-play-screen');
const adminScreen = document.getElementById('admin-screen');

const authForm = document.getElementById('auth-form');
const quizSelector = document.getElementById('quiz-selector');
const quizStats = document.getElementById('quiz-stats');
const quizForm = document.getElementById('quiz-form');
const feedback = document.getElementById('feedback');
const backSelectBtn = document.getElementById('back-select-btn');

const goAdminBtn = document.getElementById('go-admin-btn');
const studentView = document.getElementById('student-view');
const adminFilterQuiz = document.getElementById('admin-filter-quiz');
const adminResultsTable = document.getElementById('admin-results-table');

const timerBar = document.getElementById('quiz-timer-bar');
const timerDisplay = document.getElementById('timer-display');

// --- VERIFICATION DE CONNEXION ---
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;

    const { data: user, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('username', username)
        .eq('password_hash', password)
        .maybeSingle();
    
    if (error || !user) {
        return alert("Accès refusé : Identifiants incorrects.");
    }

    sessionUsername = user.username;
    sessionUserGroup = user.groupe;
    localStorage.setItem('quiz_username', sessionUsername);
    localStorage.setItem('quiz_usergroup', sessionUserGroup);
    checkLocalSession();
});

function checkLocalSession() {
    if (sessionUsername && sessionUserGroup) {
        document.getElementById('logged-username').innerText = `${sessionUsername} [${sessionUserGroup}]`;
        authScreen.classList.add('hidden');
        quizSelectionScreen.classList.remove('hidden');

        if (sessionUserGroup === "PROF") {
            studentView.classList.add('hidden');
            goAdminBtn.classList.remove('hidden');
        } else {
            studentView.classList.remove('hidden');
            goAdminBtn.classList.add('hidden');
            loadQuizzes();
            restoreActiveSession();
        }
    }
}

document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.clear();
    location.reload();
});

// --- ENTRÉE DANS L'ESPACE ENSEIGNANT ---
goAdminBtn.addEventListener('click', () => {
    if (sessionUserGroup !== "PROF") return alert("Accès interdit.");
    quizSelectionScreen.classList.add('hidden');
    adminScreen.classList.remove('hidden');
    loadAdminQuizFilter();
    loadAllResults();
});

document.getElementById('back-from-admin-btn').addEventListener('click', () => {
    adminScreen.classList.add('hidden');
    quizSelectionScreen.classList.remove('hidden');
});

// --- FONCTIONS ADMINISTRATEUR (SUPABASE) ---
async function loadAdminQuizFilter() {
    const { data: quizzes } = await supabaseClient.from('quizzes').select('title');
    adminFilterQuiz.innerHTML = '<option value="">-- Tous les quiz --</option>';
    if (quizzes) {
        quizzes.forEach(q => {
            const op = document.createElement('option');
            op.value = q.title;
            op.textContent = q.title;
            adminFilterQuiz.appendChild(op);
        });
    }
}

async function loadAllResults() {
    adminResultsTable.innerHTML = '<tr><td colspan="5" style="text-align:center;">Chargement en cours...</td></tr>';
    const adminStatsContainer = document.getElementById('admin-quiz-stats');
    
    const selectedQuizTitle = adminFilterQuiz.value;
    if (selectedQuizTitle) {
        const { data: quizData } = await supabaseClient
            .from('quizzes')
            .select('average_score, total_plays, correct_answers, groupe')
            .eq('title', selectedQuizTitle)
            .single();

        if (quizData) {
            const totalQuestions = quizData.correct_answers.split(';').filter(p => p).length;
            const { count: totalStudentsInGroup, error: countError } = await supabaseClient
                .from('profiles')
                .select('*', { count: 'exact', head: true })
                .eq('groupe', quizData.groupe);

            const targetStudents = countError ? '?' : totalStudentsInGroup;
            
            adminStatsContainer.innerHTML = `
                <div class="stat-badge admin-box" style="margin:0; width:100%;">
                    📈 Moyenne : <strong>${quizData.average_score.toFixed(1)} / ${totalQuestions}</strong><br>
                    👥 Participations : <strong>${quizData.total_plays} / ${targetStudents}</strong> <small style="color:#7f8c8d;">(Classe : ${quizData.groupe})</small>
                </div>
            `;
        }
    } else {
        adminStatsContainer.innerHTML = '';
    }

    let query = supabaseClient
        .from('quiz_results')
        .select('*')
        .order('created_at', { ascending: false });

    if (selectedQuizTitle) {
        query = query.eq('quiz_title', selectedQuizTitle);
    }

    const { data: results, error } = await query;

    if (error || !results || results.length === 0) {
        adminResultsTable.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#7f8c8d;">Aucun résultat enregistré.</td></tr>';
        return;
    }

    adminResultsTable.innerHTML = '';
    results.forEach(res => {
        const dateClean = new Date(res.created_at).toLocaleDateString('fr-FR', {
            day: 'numeric', month: 'short', hour: '2-digit', minute:'2-digit'
        });
        
        const noteClass = res.score_obtained >= 2 ? 'badge-high' : 'badge-low';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${dateClean}</td>
            <td><strong>${res.username}</strong></td>
            <td>${res.quiz_title}</td>
            <td style="font-family:monospace; color:#555;">${res.user_answers}</td>
            <td><span class="badge-note ${noteClass}">${res.score_obtained}</span></td>
        `;
        adminResultsTable.appendChild(tr);
    });
}

adminFilterQuiz.addEventListener('change', loadAllResults);

// --- CHARGEMENT DES QUIZ FILTRÉS PAR GROUPE (ÉLÈVES) ---
async function loadQuizzes() {
    // 1. Récupérer tous les quiz disponibles pour la classe de l'élève
    const { data: quizzes } = await supabaseClient
        .from('quizzes')
        .select('*')
        .eq('groupe', sessionUserGroup);

    // 2. Récupérer la liste des quiz déjà validés par cet élève
    const { data: userResults } = await supabaseClient
        .from('quiz_results')
        .select('quiz_title')
        .eq('username', sessionUsername);

    // Création d'un ensemble (Set) avec les titres des quiz déjà complétés
    const completedQuizTitles = new Set(userResults ? userResults.map(r => r.quiz_title) : []);

    quizSelector.innerHTML = '<option value="">-- Choisissez un questionnaire --</option>';
    
    if (quizzes) {
        quizzes.forEach(quiz => {
            const option = document.createElement('option');
            option.value = quiz.id;
            
            // Vérification si le quiz a déjà été effectué par l'élève
            const isCompleted = completedQuizTitles.has(quiz.title);

            if (isCompleted) {
                option.textContent = `${quiz.title} (Déjà effectué)`;
                option.disabled = true; // Rendre la sélection impossible
            } else {
                option.textContent = quiz.title;
            }

            quizSelector.appendChild(option);
        });
    }
}

// 1. AFFICHAGE DU TEMPS LIMITE LORS DE LA SÉLECTION D'UN QUIZ
quizSelector.addEventListener('change', async () => {
    const quizId = quizSelector.value;
    if (!quizId) return quizStats.classList.add('hidden');

    const { data: quiz } = await supabaseClient.from('quizzes').select('*').eq('id', quizId).single();
    if (quiz) {
        activeQuizData = quiz;
        const totalQuestions = quiz.correct_answers.split(';').filter(p => p).length;
        const timeLimitFormatted = (quiz.time_limit && quiz.time_limit > 0) ? `${quiz.time_limit} s` : "Non limité";

        quizStats.innerHTML = `
            <div class="stat-badge">📊 Moyenne de votre classe : <strong>${quiz.average_score.toFixed(1)}/${totalQuestions}</strong></div>
            <div class="stat-badge">👥 Total de participations : <strong>${quiz.total_plays}</strong></div>
            <div class="stat-badge">⏱️ Temps imparti : <strong>${timeLimitFormatted}</strong></div>
        `;
        quizStats.classList.remove('hidden');
    }
});

// --- INJECTION DYNAMIQUE DES QUESTIONS ---
function renderQuizQuestions(quizData) {
    const container = document.getElementById('dynamic-questions-container');
    container.innerHTML = '';

    const questionsList = quizData.questions;

    if (!questionsList || !Array.isArray(questionsList)) {
        container.innerHTML = '<p style="color:var(--error); text-align:center;">Erreur : Aucun énoncé de question trouvé pour ce quiz.</p>';
        return;
    }

    questionsList.forEach(question => {
        const questionBlock = document.createElement('div');
        questionBlock.className = 'question-block';

        let optionsHTML = '';
        for (const [letter, text] of Object.entries(question.options)) {
            optionsHTML += `
                <label>
                    <input type="radio" name="${question.id}" value="${letter}"> 
                    ${text}
                </label>
            `;
        }

        questionBlock.innerHTML = `
            <p><strong>${question.id.toUpperCase()}.</strong> ${question.text}</p>
            <div class="options-block">${optionsHTML}</div>
        `;
        container.appendChild(questionBlock);
    });
}

// --- LOGIQUE DU TIMER ET DE SESSIONS ---
function startTimer(remainingSeconds) {
    timerBar.classList.remove('hidden');
    
    function updateDisplay(sec) {
        const m = Math.floor(sec / 60).toString().padStart(2, '0');
        const s = (sec % 60).toString().padStart(2, '0');
        timerDisplay.textContent = `${m}:${s}`;
    }

    updateDisplay(remainingSeconds);

    let timeLeft = remainingSeconds;
    timerInterval = setInterval(() => {
        timeLeft--;
        updateDisplay(timeLeft);

        const session = JSON.parse(localStorage.getItem('active_quiz_session'));
        if (session) {
            session.endTime = Date.now() + (timeLeft * 1000);
            localStorage.setItem('active_quiz_session', JSON.stringify(session));
        }

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            submitQuiz(true);
        }
    }, 1000);
}

// --- DÉMARRAGE DU QUIZ ---
document.getElementById('start-quiz-btn').addEventListener('click', async () => {
    if (!activeQuizData) return alert("Veuillez sélectionner un quiz avant de commencer.");
    
    const startBtn = document.getElementById('start-quiz-btn');
    startBtn.disabled = true;
    startBtn.textContent = "Vérification...";

    const { data: alreadyPlayed, error } = await supabaseClient
        .from('quiz_results')
        .select('id')
        .eq('quiz_title', activeQuizData.title)
        .eq('username', sessionUsername)
        .maybeSingle();

    startBtn.disabled = false;
    startBtn.textContent = "Commencer le Quiz";

    if (error) {
        return alert("Erreur lors de la vérification de vos droits d'accès.");
    }

    if (alreadyPlayed) {
        return alert("Accès refusé : Vous avez déjà validé ce quiz. Une seule tentative est accordée.");
    }

    const limitInSeconds = activeQuizData.time_limit || 0;

    // Sauvegarde pour résister au rechargement (F5)
    if (limitInSeconds > 0) {
        const endTime = Date.now() + ((limitInSeconds + 2) * 1000);
        localStorage.setItem('active_quiz_session', JSON.stringify({
            quizId: activeQuizData.id,
            endTime: endTime
        }));
    }

    renderQuizQuestions(activeQuizData);
    document.getElementById('current-quiz-title').textContent = activeQuizData.title;
    quizSelectionScreen.classList.add('hidden');
    quizPlayScreen.classList.remove('hidden');
    
    quizForm.reset();
    quizForm.querySelector('button[type="submit"]').disabled = false;
    feedback.classList.add('hidden');
    backSelectBtn.classList.add('hidden');

    // Déclenchement du timer après un délai de 2 secondes
    if (limitInSeconds > 0) {
        timerBar.classList.remove('hidden');
        timerDisplay.textContent = "Départ dans 2s...";
        delayTimeout = setTimeout(() => {
            startTimer(limitInSeconds);
        }, 2000);
    } else {
        timerBar.classList.add('hidden');
    }
});

// --- REPRISE EN CAS DE RECHARGEMENT (F5) ---
async function restoreActiveSession() {
    const savedSession = localStorage.getItem('active_quiz_session');
    if (!savedSession || !sessionUsername) return;

    const { quizId, endTime } = JSON.parse(savedSession);
    const now = Date.now();
    const remainingSeconds = Math.floor((endTime - now) / 1000);

    const { data: quiz } = await supabaseClient.from('quizzes').select('*').eq('id', quizId).single();
    if (!quiz) return;

    activeQuizData = quiz;
    renderQuizQuestions(quiz);

    document.getElementById('current-quiz-title').textContent = quiz.title;
    quizSelectionScreen.classList.add('hidden');
    quizPlayScreen.classList.remove('hidden');

    if (remainingSeconds <= 0) {
        submitQuiz(true);
    } else {
        startTimer(remainingSeconds);
    }
}

// --- SOUMISSION FINALE DES RÉPONSES ---
async function submitQuiz(isAutoSubmit = false) {
    if (!activeQuizData) return;

    clearInterval(timerInterval);
    clearTimeout(delayTimeout);
    localStorage.removeItem('active_quiz_session');

    const submitBtn = quizForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    const formData = new FormData(quizForm);
    
    const correctAnswersObj = {};
    activeQuizData.correct_answers.split(';').forEach(pair => {
        if (!pair) return;
        const [key, val] = pair.split(':');
        if (key && val) correctAnswersObj[key.trim()] = val.trim();
    });

    let finalScore = 0;
    let userAnswersArray = [];
    const totalQuestions = Object.keys(correctAnswersObj).length;

    for (const qKey of Object.keys(correctAnswersObj)) {
        const studentAnswer = formData.get(qKey);
        
        if (studentAnswer) {
            userAnswersArray.push(`${qKey}:${studentAnswer}`);
            if (studentAnswer === correctAnswersObj[qKey]) {
                finalScore++;
            }
        } else {
            // Remplace les questions sans réponse par qn:N
            userAnswersArray.push(`${qKey}:N`);
        }
    }

    const userAnswersString = userAnswersArray.join(';') + ';';

    const { error: insertError } = await supabaseClient
        .from('quiz_results')
        .insert({
            quiz_title: activeQuizData.title,
            username: sessionUsername,
            user_answers: userAnswersString,
            score_obtained: finalScore
        });

    if (insertError) {
        console.error("Erreur d'insertion du score :", insertError);
        if (!isAutoSubmit) {
            submitBtn.disabled = false;
            return alert("Erreur technique : Impossible d'enregistrer vos résultats.");
        }
    }

    const newTotalPlays = activeQuizData.total_plays + 1;
    const newAverage = ((activeQuizData.average_score * activeQuizData.total_plays) + finalScore) / newTotalPlays;

    await supabaseClient
        .from('quizzes')
        .update({ 
            total_plays: newTotalPlays, 
            average_score: newAverage 
        })
        .eq('id', activeQuizData.id);

    const successThreshold = totalQuestions / 2;
    feedback.className = (finalScore >= successThreshold) ? "success-box" : "error-box";
    feedback.innerHTML = `${isAutoSubmit ? "⏰ Temps écoulé ! Vos réponses ont été transmises automatiquement.<br>" : ""}Quiz terminé ! Note : <strong>${finalScore} / ${totalQuestions}</strong>.`;
    
    timerBar.classList.add('hidden');
    feedback.classList.remove('hidden');
    backSelectBtn.classList.remove('hidden');
}

quizForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitQuiz(false);
});

backSelectBtn.addEventListener('click', () => {
    quizPlayScreen.classList.add('hidden');
    quizSelectionScreen.classList.remove('hidden');
    loadQuizzes();
});

// --- GESTION DE LA CRÉATION DE QUIZ ---
let newQuestionCounter = 0;

const toggleCreateZoneBtn = document.getElementById('toggle-create-zone-btn');
const createQuizSection = document.getElementById('create-quiz-section');

toggleCreateZoneBtn.addEventListener('click', () => {
    const isHidden = createQuizSection.classList.toggle('hidden');
    if (isHidden) {
        toggleCreateZoneBtn.textContent = "➕ Créer un nouveau Quiz";
        toggleCreateZoneBtn.style.background = "#2c3e50";
    } else {
        toggleCreateZoneBtn.textContent = "❌ Fermer la zone de création";
        toggleCreateZoneBtn.style.background = "#c0392b";
    }
});

function addQuestionToForm() {
    newQuestionCounter++;
    const container = document.getElementById('new-questions-container');
    
    const qBlock = document.createElement('div');
    qBlock.className = 'question-block';
    qBlock.style.border = '1px solid #ddd';
    qBlock.id = `new-q-block-${newQuestionCounter}`;
    
    qBlock.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <strong>Question ${newQuestionCounter} (Identifiant : q${newQuestionCounter})</strong>
            <button type="button" onclick="document.getElementById('new-q-block-${newQuestionCounter}').remove()" style="width:auto; padding:5px 10px; background:var(--error); font-size:12px;">Supprimer</button>
        </div>
        <input type="text" class="q-text" required placeholder="Énoncé de la question..." data-qid="q${newQuestionCounter}">
        
        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px;">
            <div><label>Option A</label><input type="text" class="q-opt-A" required placeholder="Réponse A"></div>
            <div><label>Option B</label><input type="text" class="q-opt-B" required placeholder="Réponse B"></div>
            <div><label>Option C</label><input type="text" class="q-opt-C" required placeholder="Réponse C"></div>
        </div>

        <label style="margin-top:10px; display:block;">✔️ Bonne réponse attendue :</label>
        <select class="q-correct" required style="margin-bottom:0;">
            <option value="A">Option A</option>
            <option value="B">Option B</option>
            <option value="C">Option C</option>
        </select>
    `;
    container.appendChild(qBlock);
}

document.getElementById('go-admin-btn').addEventListener('click', () => {
    if (document.getElementById('new-questions-container').children.length === 0) {
        newQuestionCounter = 0;
        addQuestionToForm();
    }
});

document.getElementById('add-question-form-btn').addEventListener('click', addQuestionToForm);

document.getElementById('create-quiz-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = document.getElementById('new-quiz-title').value.trim();
    const groupe = document.getElementById('new-quiz-group').value.trim();
    const timeLimitInput = document.getElementById('new-quiz-time-limit').value;
    const timeLimit = timeLimitInput ? parseInt(timeLimitInput, 10) : 0;

    const questionBlocks = document.getElementById('new-questions-container').children;

    if (questionBlocks.length === 0) {
        return alert("Veuillez ajouter au moins une question à votre quiz.");
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Publication en cours...";

    let questionsJsonArray = [];
    let correctAnswersArray = [];

    for (let block of questionBlocks) {
        const text = block.querySelector('.q-text').value.trim();
        const qId = block.querySelector('.q-text').dataset.qid;
        const optA = block.querySelector('.q-opt-A').value.trim();
        const optB = block.querySelector('.q-opt-B').value.trim();
        const optC = block.querySelector('.q-opt-C').value.trim();
        const correct = block.querySelector('.q-correct').value;

        questionsJsonArray.push({
            id: qId,
            text: text,
            options: { A: optA, B: optB, C: optC }
        });

        correctAnswersArray.push(`${qId}:${correct}`);
    }

    const correctAnswersString = correctAnswersArray.join(';') + ';';

    const { error } = await supabaseClient
        .from('quizzes')
        .insert({
            title: title,
            groupe: groupe,
            time_limit: timeLimit,
            questions: questionsJsonArray,
            correct_answers: correctAnswersString,
            total_plays: 0,
            average_score: 0.0
        });

    submitBtn.disabled = false;
    submitBtn.textContent = "💾 Publier le Quiz sur Supabase";

    if (error) {
        console.error("Erreur de création du quiz :", error);
        if (error.code === "23505") {
            return alert("Erreur : Ce titre de quiz existe déjà.");
        }
        return alert("Impossible d'enregistrer le quiz.");
    }

    alert("🎉 Le quiz a été créé et publié avec succès !");

    createQuizSection.classList.add('hidden');
    toggleCreateZoneBtn.textContent = "➕ Créer un nouveau Quiz";
    toggleCreateZoneBtn.style.background = "#2c3e50";

    document.getElementById('create-quiz-form').reset();
    document.getElementById('new-questions-container').innerHTML = '';
    newQuestionCounter = 0;
    addQuestionToForm();
    
    loadAdminQuizFilter();
    loadAllResults();
});

checkLocalSession();
