/**
 * Client-side logic for the Quality Assurance page.
 */
const MAX_PROMPTS_ON_DISPLAY = 15;

let stage = 0;
let prompt_count = 0;

/**
 * MAPPING: Focus Area (Category) -> Specific Quality Tasks
 * This allows the dropdown to dynamically populate.
 */
const ACTIVITY_DATA = {
    'General Quality Assurance': [
        "Course Review / Evaluation",
        "Lesson Observation Feedback",
        "Student Voice Analysis",
        "Stakeholder Feedback Summary",
        "Meeting Minutes Actions"
    ],
    'SAR': [
        "Draft Section: INTENT (Curriculum Design)",
        "Draft Section: IMPLEMENTATION (Teaching)",
        "Draft Section: IMPACT (Outcomes)",
        "Summarize Strengths & Weaknesses",
        "Justify Proposed Grade"
    ],
    'QIP': [
        "Convert Weakness to SMART Action",
        "Generate Progress Milestones",
        "Define Impact Measures"
    ],
    'Inspection Prep': [
        "Anticipate Deep Dive Questions",
        "Generate Student Voice Themes",
        "Create Staff Briefing Sheet"
    ],
    'Deep Dive': [
        "Analyze Curriculum Sequencing",
        "Work Scrutiny Checklist",
        "Deep Dive Line of Enquiry"
    ],
    'Data Narrative': [
        "Analyze 3-Year Trend",
        "Identify Achievement Gaps",
        "Explain Data Dip / Recovery Plan"
    ]
};

/**
 * Main entry: attach all home page event handlers
 */
document.addEventListener('DOMContentLoaded', (event) => {

    const modal = document.getElementById("modal");
    const modalClose = document.getElementById("modal-close");
    if(modalClose) {
        modalClose.addEventListener("click", function () {
            modal.style.display = "none";
        });
    }

    window.addEventListener("click", function (event) {
        if (event.target == modal) {
            modal.style.display = "none";
        }
    });

    // Set up copy buttons for each response block
    for (let i = 1; i <= MAX_PROMPTS_ON_DISPLAY; i++) {
        const copyButton = document.getElementById(`copy-button-${i}`);
        if(copyButton) {
            const copyPrompt = () => {
                const promptText = document.getElementById(`response-text-${i}`);
                const textToCopy = promptText.innerText;

                navigator.clipboard.writeText(textToCopy).then(function () {
                    copyButton.innerHTML = '<span class="material-symbols-outlined">check</span> Copied!';
                    setTimeout(() => {
                        copyButton.innerHTML = '<span class="material-symbols-outlined">content_copy</span> Copy';
                    }, 3000);
                }, function (err) {
                    showToast('Could not copy text');
                });
            }
            copyButton.addEventListener("click", copyPrompt);
        }
    }

    document.getElementById("show-help").addEventListener("click", showHelp);
    document.getElementById("hide-help").addEventListener('click', hideHelp);

    window.addEventListener('resize', checkOverflow);
    checkOverflow();
    handleScroll();

    window.addEventListener('scroll', handleScroll);
    document.getElementById('scroll-indicator').addEventListener('click', scrollToBottom);

    loadSelections();

    document.addEventListener('click', hideBubbles);

    // --- BUTTONS ---
    const generateButton = document.getElementById('generate-button');
    if (generateButton) {
        generateButton.addEventListener("click", generatePrompts);
    }

    const generateMoreButton = document.getElementById('generate-more-button');
    if (generateMoreButton) {
        generateMoreButton.addEventListener("click", generateMorePrompts);
    }

    // --- DYNAMIC DROPDOWN LOGIC (Fixing the greyed out issue) ---
    const activityCategory = document.getElementById('activityCategory');
    const activityType = document.getElementById('activityType');

    if (activityCategory && activityType) {
        activityCategory.addEventListener('change', function() {
            const selectedCategory = this.value;
            const tasks = ACTIVITY_DATA[selectedCategory];

            // Reset dropdown
            activityType.innerHTML = '<option value="" disabled selected>Select Specific Task...</option>';
            
            if (tasks && tasks.length > 0) {
                // Populate new options
                tasks.forEach(task => {
                    const option = document.createElement('option');
                    option.value = task; // Sending the string value directly
                    option.textContent = task;
                    activityType.appendChild(option);
                });
                // Enable the dropdown
                activityType.disabled = false;
            } else {
                activityType.disabled = true;
            }
        });
    }

    // --- OTHER UI ELEMENTS ---
    const textarea = document.getElementById('topic');
    if(textarea) {
        textarea.addEventListener('keydown', (event) => {
            if (event.key === "Enter") {
                if (event.shiftKey) {
                    const cursorPosition = textarea.selectionStart;
                    textarea.value = textarea.value.slice(0, cursorPosition) + '\n' + textarea.value.slice(cursorPosition);
                    textarea.selectionStart = textarea.selectionEnd = cursorPosition + 1;
                    event.preventDefault();
                } else {
                    event.preventDefault();
                    generatePrompts();
                }
            }
        });
    }

    const startAgainBtn = document.getElementById("start-again");
    if(startAgainBtn) startAgainBtn.addEventListener("click", startAgain);
    
    const logoutBtn = document.getElementById("logout");
    if(logoutBtn) logoutBtn.addEventListener("click", confirmLogout);

    const copyToggleCheckbox = document.getElementById("copyToggleCheckbox");
    if(copyToggleCheckbox) {
        const copyToggleChecked = localStorage.getItem('copyToggleCheckbox');
        copyToggleCheckbox.checked = copyToggleChecked === "true";
        copyToggleCheckbox.addEventListener("change", () => {
            localStorage.setItem('copyToggleCheckbox', copyToggleCheckbox.checked ? "true" : "false");
        });
    }
});0

/**
 * Populate the page with newly generated prompts (Dual Output Version)
 */
function displayPrompts(data) {
    document.getElementById("main-loader").classList.add("hidden");
    document.getElementById("start-again-container").classList.remove("hidden");

    // We keep the old toggle container logic just to prevent errors, even if hidden
    const toggle = document.getElementById("copy-toggle");
    const toggleContainer = document.getElementById("toggle-container-2");
    if(toggle && toggleContainer) {
        toggleContainer.appendChild(toggle);
    }

    const moreContainer = document.getElementById("generate-more-container");
    if(moreContainer) moreContainer.classList.remove('hidden');

    // Loop through results and build UI entries
    for (let i = prompt_count; i < data.prompts.length + prompt_count; i++) {

        const prompt_index = i - prompt_count;
        const promptData = data.prompts[prompt_index];

        // 1. Populate Heading
        let headingText = promptData.prompt_heading;
        if (headingText.length > 50) headingText = headingText.substring(0, 50) + "...";
        const headingEl = document.getElementById(`response-heading-text-${i + 1}`);
        if(headingEl) headingEl.innerText = headingText;

        // 2. Populate Reason Bubble
        const reasonBtn = document.getElementById(`reason-button-${i + 1}`);
        if(reasonBtn) {
            // Remove old listeners to prevent stacking
            const newReasonBtn = reasonBtn.cloneNode(true);
            reasonBtn.parentNode.replaceChild(newReasonBtn, reasonBtn);
            
            newReasonBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                hideBubbles();
                const bubble = document.getElementById(`response-reason-${i + 1}`);
                if(bubble) {
                    bubble.classList.add('speech-bubble-visible');
                    bubble.innerText = promptData.reason_for_choosing;
                }
            });
        }

        // 3. Populat Copilot Output
        const copilotBox = document.getElementById(`copilot-text-${i + 1}`);
        
        if (copilotBox) copilotBox.innerText = promptData.copilot_prompt;

        // 4. Show Container
        const container = document.getElementById(`response-container-${i + 1}`);
        if(container) container.classList.remove('hidden');

        // 5. Setup Copy Buttons (One for each)
        const setupCopy = (btnId, textId) => {
            const btn = document.getElementById(btnId);
            if(btn) {
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);
                newBtn.addEventListener('click', () => {
                    const textElement = document.getElementById(textId);
                    if(!textElement) return;
                    
                    const text = textElement.innerText;
                    navigator.clipboard.writeText(text).then(() => {
                        const originalHTML = newBtn.innerHTML;
                        // Use HTML to include the icon
                        newBtn.innerHTML = '<span class="material-symbols-outlined">check</span> Copied!'; 
                        setTimeout(() => { newBtn.innerHTML = originalHTML; }, 2000);
                    });
                });
            }
        };

    setupCopy(`copy-copilot-${i + 1}`, `copilot-text-${i + 1}`);
    }

    prompt_count += data.prompts.length;

    if (prompt_count >= 15) {
        if(moreContainer) moreContainer.classList.add('hidden');
    }
}
/**
 * OVERRIDE: Generate Prompts with Flexible Validation
 * Allows optional fields (Subject, Context, etc.) to be left blank.
 */
async function generatePrompts() {
    // 1. Get values
    const level = document.getElementById('level').value;
    const subject = document.getElementById('subject').value; 
    const activityCategory = document.getElementById('activityCategory').value;
    const activityType = document.getElementById('activityType').value;
    const unit = document.getElementById('unit').value;
    const learningOutcome = document.getElementById('learningOutcome').value; 
    const topic = document.getElementById('topic').value; 

    // 2. Validate ONLY the essentials (The Dropdowns)
    if (!activityCategory || activityCategory === "") {
        showToast("Please select a Focus Area first.", "error"); 
        return;
    }
    if (!activityType || activityType === "") {
        showToast("Please select a Specific Quality Task.", "error");
        return;
    }

    // 3. UI Loading State
    const btn = document.getElementById('generate-button');
    if(btn) btn.classList.add('loading');
    
    document.getElementById('main-loader').classList.remove('hidden');

    // 4. Send to API
    try {
        const response = await fetch('/api/generatePrompts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                level, subject, activityCategory, activityType, unit, learningOutcome, topic
            })
        });

        const data = await response.json();
        
        // 5. Handle Display
        if (data.error) {
            showToast(data.error, "error");
        } else {
            displayPrompts(data); 
        }
    } catch (err) {
        console.error(err);
        showToast("An error occurred. Check the console.", "error");
    } finally {
        if(btn) btn.classList.remove('loading');
        document.getElementById('main-loader').classList.add('hidden');
    }
}