/**
 * Help articles for the "Need help?" chat. Written for people who are new to computers: short sentences,
 * the exact button names, one step per line. `npm run help:sync` copies them into Snowflake, where Cortex
 * Search indexes them; the chat also searches them locally when Snowflake isn't set up.
 */
export interface HelpArticle {
  id: string;
  title: string;
  body: string;
}

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "sign-in",
    title: "Signing in and signing out",
    body: `To sign in:
1. Open the Carryover website. You will see the sign-in page.
2. Type your email address in the Email box.
3. Type your password in the Password box.
4. Click the Sign in button.
If you are trying the demo, the sign-in page lists the demo accounts you can use.

To sign out, click Sign out in the top right corner of any page. Sign out when you leave the computer so no one else can see patient information.`,
  },
  {
    id: "find-patient",
    title: "Finding a patient",
    body: `After you sign in you see My patients: a list of the patients assigned to you.
1. Find the patient's name in the list (it is sorted by last name).
2. Click the name to open the patient's page.

Faster way: click "Jump to…" in the top bar (or press Ctrl and K together, or Command and K on a Mac), start typing the patient's name, and press Enter.

In the list, "ES" means the patient prefers Spanish. The "open" badge shows how many to-dos are left from past visits. A red badge means something is overdue.`,
  },
  {
    id: "add-edit-patient",
    title: "Adding a new patient or changing a patient's details",
    body: `To add a new patient:
1. Go to My patients.
2. Click the Add patient button.
3. Fill in first name, last name, date of birth and sex. Email, preferred language, medications, allergies and conditions are optional.
4. Click Add patient at the bottom of the form. The new patient's page opens.

To change a patient's details (for example a new allergy or medication):
1. Open the patient's page.
2. Click Edit next to Start visit.
3. Make your change and click Save changes.`,
  },
  {
    id: "patient-page",
    title: "Reading a patient's page",
    body: `A patient's page shows everything you need before a visit:
- At the top: name, age, date of birth, preferred language, and any allergy in red.
- Four boxes: latest blood pressure, open items, last signed visit, and number of medications.
- Pre-visit brief: a short summary of the patient's history.
- Open items: to-dos left from earlier visits.
- Visit history: past visits. Click one to open it.
- On the right: blood pressure trend chart, medications, conditions and allergies.
To start a new visit, click Start visit.`,
  },
  {
    id: "start-visit",
    title: "Starting a visit and choosing the visit type",
    body: `1. Open the patient's page.
2. Click the Start visit button.
3. Choose the visit type, for example Hypertension follow-up, Diabetes follow-up, Headache or Annual physical. If none fits, choose Regular visit (the last option).
4. If you took vital signs (blood pressure, heart rate, temperature, oxygen, weight), type them in the Vitals boxes. This is optional.
5. Click Continue to recording.
The visit type decides which checklist Carryover uses to spot anything that was missed.`,
  },
  {
    id: "recording",
    title: "Recording the conversation",
    body: `1. Ask the patient if it is OK to record, then tick the box "Patient consent to record confirmed".
2. Click Start recording. If the browser asks to use the microphone, click Allow.
3. Talk with the patient normally. The screen shows a moving line while it listens.
4. When the visit is over, click End visit.
Carryover then uploads the recording and starts preparing the note by itself. Recordings stop automatically after 10 minutes.
For a demo without a microphone, click Load demo visit to use a saved recording.`,
  },
  {
    id: "live-copilot",
    title: "Suggestions that appear while recording",
    body: `While you record, Carryover may show a suggested question on the right side of the screen, for example a reminder to ask about allergies or side effects. These come from what has been said so far.
- If the suggestion helps, just ask the patient. Carryover notices when it has been covered.
- If it does not apply, click the X to dismiss it.
Suggestions are only reminders. You decide what to ask.`,
  },
  {
    id: "processing",
    title: "What happens after you end the visit",
    body: `After you click End visit, Carryover:
1. Turns the recording into written text (the transcript).
2. Writes a draft note from it.
3. Checks the draft against the conversation and the visit checklist.
This usually takes about half a minute. The screen shows each step as it finishes, then opens the review screen.
If you see "offline mode", one of the online services was not available, so Carryover used a saved demo result instead. Everything else works the same.`,
  },
  {
    id: "review-note",
    title: "Reviewing the draft note",
    body: `The review screen has three parts: the note on the left, the transcript in the middle, and missed items on the right.
- Sentences highlighted in yellow need your review because Carryover is less sure about them.
- Click any sentence to see and hear exactly where it came from in the conversation.
- To approve a sentence, click the tick (Accept). To change it, click the pencil (Edit), change the words and press Enter. To remove it, click the bin (Delete).
- To add your own sentence, click Add sentence.
Keyboard shortcuts: n jumps to the next highlighted sentence, a accepts it, e edits it.`,
  },
  {
    id: "missed-items",
    title: "Missed items on the review screen",
    body: `The Missed items panel on the right lists things the visit checklist expected but the conversation did not cover, and to-dos carried over from the last visit. Items marked "required" must be handled before signing without a reason.
For each item you can:
- Add: type a sentence, and it goes into the note.
- Dismiss: pick a reason, for example "not applicable".
- Defer: move it to the next visit. It becomes an open item on the patient's page.
You can undo any of these from the Resolved list.`,
  },
  {
    id: "sign-note",
    title: "Signing the note",
    body: `1. When you have reviewed the note, click Sign note at the bottom right of the review screen.
2. A window opens. If some required items were not handled, choose a reason to sign anyway from the list. It is saved with the note.
3. Click Sign note (or Override and sign, if you chose a reason).
After signing, the note is locked and Carryover opens the Follow-through screen. You can always read the signed note later from the patient's Visit history.`,
  },
  {
    id: "follow-through",
    title: "Follow-through: office tasks and the patient summary",
    body: `After signing, the Follow-through screen shows:
- Tasks for the office, such as lab orders or a follow-up appointment. You can edit, add or remove them. Each task becomes an open item for the next visit.
- A plain-language summary for the patient, in English and, if needed, Spanish. You can edit the text.

To send the summary to the patient:
1. Choose English or Español.
2. Click Preview PDF to check it.
3. For Spanish, tick "I reviewed the Spanish summary".
4. Click Approve & send, check the email address, and confirm.`,
  },
  {
    id: "open-items",
    title: "Open items: to-dos carried between visits",
    body: `Open items are things still to do for a patient, like a lab test to review or an appointment to book. They come from follow-through tasks and from missed items you deferred.
On the patient's page each item shows its due date. "Overdue" in red means the due date has passed.
To close an item:
- Click Done next to it when it is finished. If you clicked by mistake, click Undo.
- Or cover it at the next visit: it appears in that visit's Missed items and closes when you sign the note.`,
  },
  {
    id: "clinical-report",
    title: "The clinical visit report and PDF",
    body: `Every signed visit has a clinical report, a formal document built from the signed note.
1. Open the patient's page and click the visit in Visit history.
2. Click Clinical report.
3. You can change the text of any section. Click Save when you are done.
4. Click Download PDF to open the report as a printable PDF.
Save your changes before downloading, or the PDF will not include them.`,
  },
  {
    id: "status-page",
    title: "Checking that everything is working",
    body: `Click Status in the top bar to see whether each service Carryover uses is ready: the database, transcription, the AI that writes notes, patient memory, email and this help assistant.
- Green means ready.
- Yellow means not set up.
- Red means there is a problem.
Click Re-check to test again. Checking does not cost anything.`,
  },
  {
    id: "appearance",
    title: "Changing how Carryover looks",
    body: `In the top bar there are three small buttons to change the colours: light (sun), grey, and dark (moon). Click the one you find easiest to read. Carryover remembers your choice on this computer.
The heart button turns the moving heartbeat trail behind your mouse pointer on or off.
To make text bigger, hold Ctrl and press + (on a Mac, hold Command and press +). Press Ctrl and 0 to go back to normal size.`,
  },
  {
    id: "about",
    title: "What Carryover is, and what this help can answer",
    body: `Carryover is a prototype that helps a clinician write the visit note while talking with the patient, spot anything that was missed, and follow up afterwards. It uses synthetic (made-up) patients only and is not for real medical care.
This help assistant answers questions about using the Carryover website. It cannot give medical advice. For medical questions, please ask a qualified clinician.
If an answer doesn't help, or you have feedback, email the Carryover team at carryover.official.01@gmail.com.`,
  },
];

/** Questions offered as one-click buttons when the chat opens. */
export const SUGGESTED_QUESTIONS = [
  "How do I start a visit?",
  "How do I record the conversation?",
  "What are the yellow sentences?",
  "How do I send the summary to the patient?",
  "How do I close an open item?",
];

export const articleById = (id: string) => HELP_ARTICLES.find((a) => a.id === id);

/** Shown under every answer in the Help panel. */
export const SUPPORT_EMAIL = "carryover.official.01@gmail.com";
