        // --- CONFIGURATION SUPABASE ---
        const SUPABASE_URL = "https://vphdknzbujxlvqfvqhnv.supabase.co";
        const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwaGRrbnpidWp4bHZxZnZxaG52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3Nzc3NjYsImV4cCI6MjEwMjM1Mzc2Nn0.S4-6jNDCBzxGgH8HLvnYrIfQCtGgNNz3IckrLA1gZv8";
        const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        // --- ÉTATS GLOBAUX ---
        let sessionUsername = localStorage.getItem('quiz_username') || null; 
        let sessionUserGroup = localStorage.getItem('quiz_usergroup') || null;
        let activeQuizData = null;

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
                // 1. Récupération des données du quiz (moyenne, groupe ciblé et réponses attendues)
                const { data: quizData } = await supabaseClient
                    .from('quizzes')
                    .select('average_score, total_plays, correct_answers, groupe')
                    .eq('title', selectedQuizTitle)
                    .single();

                if (quizData) {
                    // 2. Calcul du nombre de questions pour le barème
                    const totalQuestions = quizData.correct_answers.split(';').filter(p => p).length;
                    
                    // 3. Requête Supabase pour compter combien d'élèves appartiennent à ce groupe scolaire
                    const { count: totalStudentsInGroup, error: countError } = await supabaseClient
                        .from('profiles')
                        .select('*', { count: 'exact', head: true }) // Optimisé : demande uniquement le total sans charger les lignes
                        .eq('groupe', quizData.groupe);

                    // Sécurité si la requête de comptage échoue ou retourne 0
                    const targetStudents = countError ? '?' : totalStudentsInGroup;
                    
                    adminStatsContainer.innerHTML = `
                        <div class="stat-badge admin-box" style="margin:0; width:100%;">
                            📈 Moyenne : <strong>${quizData.average_score.toFixed(1)} / ${totalQuestions}</strong><br>
                            👥 Participations : <strong>${quizData.total_plays} / ${targetStudents}</strong> <small style="color:#7f8c8d;">(Classe : ${quizData.groupe})</small>
                        </div>
                    `;
                }
            } else {
                // Si l'enseignant sélectionne "-- Tous les quiz --", on efface le bloc de statistiques
                adminStatsContainer.innerHTML = '';
            }

            // 4. Chargement et affichage du tableau des copies des élèves
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
            const { data: quizzes } = await supabaseClient
                .from('quizzes')
                .select('*')
                .eq('groupe', sessionUserGroup);

            quizSelector.innerHTML = '<option value="">-- Choisissez un questionnaire --</option>';
            if (quizzes) {
                quizzes.forEach(quiz => {
                    const option = document.createElement('option');
                    option.value = quiz.id;
                    option.textContent = quiz.title;
                    quizSelector.appendChild(option);
                });
            }
        }

        quizSelector.addEventListener('change', async () => {
            const quizId = quizSelector.value;
            if (!quizId) return quizStats.classList.add('hidden');

            const { data: quiz } = await supabaseClient.from('quizzes').select('*').eq('id', quizId).single();
            if (quiz) {
                activeQuizData = quiz;
                const totalQuestions = quiz.correct_answers.split(';').filter(p => p).length;
                quizStats.innerHTML = `
                    <div class="stat-badge">📊 Moyenne de votre classe : <strong>${quiz.average_score.toFixed(1)}/${totalQuestions}</strong></div>
                    <div class="stat-badge">👥 Total de participations : <strong>${quiz.total_plays}</strong></div>
                `;
                quizStats.classList.remove('hidden');
            }
        });

        // --- INJECTION 100% DYNAMIQUE DEPUIS LE JSON DE LA BDD ---
        function renderQuizQuestions(quizData) {
            const container = document.getElementById('dynamic-questions-container');
            container.innerHTML = ''; // Nettoyer l'affichage précédent

            // Récupération du tableau de questions depuis la colonne JSONB
            const questionsList = quizData.questions;

            if (!questionsList || !Array.isArray(questionsList)) {
                container.innerHTML = '<p style="color:var(--error); text-align:center;">Erreur : Aucun énoncé de question trouvé pour ce quiz.</p>';
                return;
            }

            // Générer le HTML pour chaque question présente dans le JSON
            questionsList.forEach(question => {
                const questionBlock = document.createElement('div');
                questionBlock.className = 'question-block';

                let optionsHTML = '';
                // Boucle sur les options de réponse (ex: A, B, C...)
                for (const [letter, text] of Object.entries(question.options)) {
                    optionsHTML += `
                        <label>
                            <input type="radio" name="${question.id}" value="${letter}" required> 
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

        // --- ENCLENCHEMENT DU BOUTON COMMENCER LE QUIZ ---
        document.getElementById('start-quiz-btn').addEventListener('click', async () => {
            if (!activeQuizData) return alert("Veuillez sélectionner un quiz avant de commencer.");
            
            const startBtn = document.getElementById('start-quiz-btn');
            startBtn.disabled = true;
            startBtn.textContent = "Vérification...";

            // Requête anti-triche : l'élève a-t-il déjà envoyé une note ?
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

            // Génération visuelle des blocs de questions du JSON
            renderQuizQuestions(activeQuizData);

            // Transition vers l'écran de jeu
            document.getElementById('current-quiz-title').textContent = activeQuizData.title;
            quizSelectionScreen.classList.add('hidden');
            quizPlayScreen.classList.remove('hidden');
            
            // Réinitialisation des contrôles du formulaire
            quizForm.reset();
            quizForm.querySelector('button[type="submit"]').disabled = false;
            feedback.classList.add('hidden');
            backSelectBtn.classList.add('hidden');
        });


        // --- VALIDATION ET CALCUL DU SCORE DYNAMIQUE ---
        quizForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Désactiver le bouton de soumission pour éviter les doubles envois
            const submitBtn = quizForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;

            const formData = new FormData(quizForm);
            
            // 1. Décodage des réponses correctes attendues ("q1:C;q2:A;q3:B;" -> objet {q1: "C", q2: "A", q3: "B"})
            const correctAnswersObj = {};
            activeQuizData.correct_answers.split(';').forEach(pair => {
                if (!pair) return;
                const [key, val] = pair.split(':');
                if (key && val) correctAnswersObj[key.trim()] = val.trim();
            });

            // 2. Évaluation dynamique des choix cochés par l'élève
            let finalScore = 0;
            let userAnswersArray = [];
            const totalQuestions = Object.keys(correctAnswersObj).length;

            for (const qKey of Object.keys(correctAnswersObj)) {
                const studentAnswer = formData.get(qKey); // Récupère la valeur du bouton radio coché (A, B, C...)
                userAnswersArray.push(`${qKey}:${studentAnswer || 'Aucune'}`);
                
                // Si la réponse de l'élève correspond exactement à la bonne réponse
                if (studentAnswer === correctAnswersObj[qKey]) {
                    finalScore++;
                }
            }

            // Transformation des choix de l'élève au format texte standardisé pour la base de données
            const userAnswersString = userAnswersArray.join(';') + ';';

            // 3. Enregistrement du résultat dans la table quiz_results
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
                submitBtn.disabled = false;
                return alert("Erreur technique : Impossible d'enregistrer vos résultats.");
            }

            // 4. Calcul et mise à jour de la moyenne de la classe et du nombre de participations
            const newTotalPlays = activeQuizData.total_plays + 1;
            const newAverage = ((activeQuizData.average_score * activeQuizData.total_plays) + finalScore) / newTotalPlays;

            const { error: updateError } = await supabaseClient
                .from('quizzes')
                .update({ 
                    total_plays: newTotalPlays, 
                    average_score: newAverage 
                })
                .eq('id', activeQuizData.id);

            if (updateError) {
                console.error("Erreur de mise à jour des statistiques du quiz :", updateError);
            }

            // 5. Affichage du résultat final adapté au nombre de questions
            const successThreshold = totalQuestions / 2; // Moyenne pour afficher en vert
            feedback.className = (finalScore >= successThreshold) ? "success-box" : "error-box";
            feedback.innerHTML = `Quiz terminé ! Votre note : <strong>${finalScore} / ${totalQuestions}</strong>.<br>Vos réponses ont été transmises avec succès à l'enseignant.`;
            
            // Rendre visible la zone de message et le bouton de retour
            feedback.classList.remove('hidden');
            backSelectBtn.classList.remove('hidden');
        });



        backSelectBtn.addEventListener('click', () => {
            quizPlayScreen.classList.add('hidden');
            quizSelectionScreen.classList.remove('hidden');
            loadQuizzes();
        });

        // --- GESTION DE LA CRÉATION DE QUIZ PAR L'ENSEIGNANT ---
        let newQuestionCounter = 0;


        // --- INTERRUPTEUR D'AFFICHAGE DE LA ZONE DE CRÉATION ---
        const toggleCreateZoneBtn = document.getElementById('toggle-create-zone-btn');
        const createQuizSection = document.getElementById('create-quiz-section');

        toggleCreateZoneBtn.addEventListener('click', () => {
            // Inversion de la classe 'hidden' pour afficher ou masquer le volet
            const isHidden = createQuizSection.classList.toggle('hidden');
            
            // Adaptation dynamique du texte du bouton selon l'état
            if (isHidden) {
                toggleCreateZoneBtn.textContent = "➕ Créer un nouveau Quiz";
                toggleCreateZoneBtn.style.background = "#2c3e50";
            } else {
                toggleCreateZoneBtn.textContent = "❌ Fermer la zone de création";
                toggleCreateZoneBtn.style.background = "#c0392b"; // Change en rouge pour signaler la fermeture
            }
        });


        // Fonction pour générer un bloc de question vierge dans le formulaire
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

        // Ajouter une première question par défaut à l'ouverture du panneau
        document.getElementById('go-admin-btn').addEventListener('click', () => {
            if (document.getElementById('new-questions-container').children.length === 0) {
                newQuestionCounter = 0;
                addQuestionToForm();
            }
        });

        document.getElementById('add-question-form-btn').addEventListener('click', addQuestionToForm);

        // Soumission et enregistrement du nouveau quiz dans Supabase
        document.getElementById('create-quiz-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const title = document.getElementById('new-quiz-title').value.trim();
            const groupe = document.getElementById('new-quiz-group').value.trim();
            const questionBlocks = document.getElementById('new-questions-container').children;

            if (questionBlocks.length === 0) {
                return alert("Veuillez ajouter au moins une question à votre quiz.");
            }

            const submitBtn = e.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = "Publication en cours...";

            let questionsJsonArray = [];
            let correctAnswersArray = [];

            // Parcourir chaque bloc de question pour extraire les données saisies
            for (let block of questionBlocks) {
                const text = block.querySelector('.q-text').value.trim();
                const qId = block.querySelector('.q-text').dataset.qid;
                const optA = block.querySelector('.q-opt-A').value.trim();
                const optB = block.querySelector('.q-opt-B').value.trim();
                const optC = block.querySelector('.q-opt-C').value.trim();
                const correct = block.querySelector('.q-correct').value;

                // Construction de l'objet pour la colonne JSONB
                questionsJsonArray.push({
                    id: qId,
                    text: text,
                    options: { A: optA, B: optB, C: optC }
                });

                // Construction de l'élément pour la chaîne correct_answers (ex: q1:A)
                correctAnswersArray.push(`${qId}:${correct}`);
            }

            // Génération de la chaîne finale textuelle (ex: "q1:A;q2:C;")
            const correctAnswersString = correctAnswersArray.join(';') + ';';

            // Insertion dans la table 'quizzes' de Supabase
            const { error } = await supabaseClient
                .from('quizzes')
                .insert({
                    title: title,
                    groupe: groupe,
                    questions: questionsJsonArray, // Tableau envoyé tel quel dans le champ JSONB
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

            // Masquer automatiquement le formulaire après une publication réussie
            createQuizSection.classList.add('hidden');
            toggleCreateZoneBtn.textContent = "➕ Créer un nouveau Quiz";
            toggleCreateZoneBtn.style.background = "#2c3e50";


            // Réinitialisation du formulaire
            document.getElementById('create-quiz-form').reset();
            document.getElementById('new-questions-container').innerHTML = '';
            newQuestionCounter = 0;
            addQuestionToForm();
            
            // Recharger les filtres et les résultats pour inclure le nouveau quiz
            loadAdminQuizFilter();
            loadAllResults();
        });
        

        checkLocalSession();

