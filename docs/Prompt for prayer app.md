Create a Flutter application using Supabase (PostgreSQL as the database) as the backend. The app is a Christian prayer tracker for a husband and wife to manage and track prayers for families they know, as well as for their own family, with shared data access between their two accounts.

**I. Authentication and Data Sharing:**

1.  **User Authentication:**
    * Implement user sign-up and sign-in using Supabase Authentication (e.g., email/password, or third-party providers like Google Sign-In).
2.  **Account Linking & Data Sharing:**
    * The app must allow two distinct user accounts (e.g., husband and wife) to link and share access to the *same dataset* (all families, prayer requests, journal entries, etc.).
    * **Mechanism Idea:**
        * The first user to set up the app creates the initial dataset.
        * This user can then generate a unique "share code" to the second user.
        * The second user, upon signing in, can use this code/invitation to link to the first user's dataset.
        * Once linked, both users have full read/write permissions to the shared data, and any changes made by one user are immediately visible to the other (similar to what Google Docs does with shared documents).
    * All data related to prayer cards, requests, and journals will be associated with this shared "family space" accessible by both linked accounts.

**II. Core User Settings (within the shared account):**

1.  **User Profile Names (for tracking who prayed):**
    * Allow customization of two display names (e.g., "John," "Sarah") associated with the linked accounts. These names will be used for the `lastPrayedBy` field on Family Cards. For personal prayer requests in the "Praying Tonight" view, the prayer is implicitly by the other user.
2.  **Data Management:**
    * **Import Data:** Ability to import family lists and prayer requests from a CSV file into the shared dataset.
    * **Export Data:** Ability to export all shared prayer data (families, requests, journals) to a CSV file.
    * **Offline Support:** The app should function seamlessly offline for both users, queueing any data changes and syncing them with the shared Supabase dataset once an internet connection is available.

**III. Prayer for Other Families (Shared Data):**

1.  **Family Cards:**
    * **Data Fields:**
        * `familyName`: String (Title of the card)
        * `parents`: String
        * `children`: List of Strings
        * `categoryTag`: String (e.g., "Church Friends," "Neighbors," "Missionaries" - user-definable categories)
        * `lastPrayedDate`: Timestamp
        * `lastPrayedBy`: String (Selectable from the two configured user profile names)
        * `journalNotes`: String (For general notes, praises, life events related to the family)
        * `linkedScripture`: String (Optional: a Bible verse or passage associated with the family generally)
        * `isArchived`: Boolean (Default: false)
    * **Functionality:**
        * Add, edit, delete family cards.
        * View family cards in a filterable and sortable list/grid.
        * **Archive/Unarchive:** Ability to archive families and view archived families separately.

2.  **"Praying Tonight" Smart Rotation View:**
    * This view should automatically suggest a mix of items needing prayer:
        * Exactly 4 family cards from the shared list that have the **oldest `lastPrayedDate`**. Families that have never been prayed for should be prioritized.
        * Personal prayer requests from the "Our Family" section, selected as follows:
            * First, all *active* ("Praying" status) personal prayer requests where `dateAdded` is today.
            * Then, if the count of "today's" requests is less than 3 (aiming for 3-5 total personal requests), add the oldest *active* personal prayer requests (based on `lastPrayedDate`, prioritizing those never prayed for, and not already included from "today's" list) until 3-5 personal requests are displayed, or all active personal requests are shown if there are fewer than 3 in total.
    * Users can see these suggested families and personal requests.
    * **Assignment & Prayer Update:**
        * Ability to assign/confirm which of the two users prayed for specific families or acknowledged prayer for personal requests among those displayed.
        * Upon confirmation:
            * For Family Cards: `lastPrayedDate` is updated to the current timestamp, and `lastPrayedBy` is updated.
            * For Personal Prayer Requests: `lastPrayedDate` on the `personalPrayerRequest` object is updated to the current timestamp. The `lastPrayedBy` is implicitly the other linked user (not the `requesterName`).
    * Allow manual override if the users decide to pray for different families or personal requests.
    * **Prayer Summarization (GenAI - OpenAI API):**
        * For the items displayed in the "Praying Tonight" view, provide a button: "Generate Prayer Focus."
        * When tapped, this feature will use a GenAI model (e.g., OpenAI API via a secure Supabase Edge Function) to:
            * **For a Family Card:**
                * List the active prayer requests for that family.
                * Randomly select and display up to 3 "Answered" prayer requests for that family (as a point of thanksgiving).
            * **For a Personal Prayer Request:**
                * Display the `requestText`, any `notes`, and its `linkedScripture`.
            * The summary should be concise and displayed clearly on this screen.
            * *Data to API (Family):* Family name (optional, for context), list of active prayer request texts, list of answered prayer request texts.
            * *Data to API (Personal Request):* The `requestText` and `notes` of the personal prayer request.

3.  **Prayer Requests (Linked to Family Cards - Shared Data):**
    * **Data Fields:**
        * `familyId`: String (Reference to the parent Family Card)
        * `requestText`: String
        * `status`: String (Dropdown: "Praying," "Answered")
        * `dateAdded`: Timestamp
        * `dateUpdated`: Timestamp (Auto-updated on edit or status change)
        * `notes`: String (Specific notes for this prayer request)
        * `linkedScripture`: String (Optional: a Bible verse specific to this prayer request)
    * **Functionality:**
        * Add, edit, delete prayer requests.
        * Change status.
        * Display requests under their respective family.
        * **Scripture Suggestion (OpenAI API):**
            * After a user types in the `requestText` (and perhaps `notes`), provide an "Suggest Scripture" AI button.
            * When tapped, this sends the `requestText` (and optionally notes) to a GenAI model (e.g., OpenAI API via a secure Supabase Edge Function).
            * The model returns 1-3 relevant Bible verse suggestions, which are then displayed to the user to choose from or be inspired by (not auto-filled, but suggested).
            * *Data to API:* The text of the prayer request.

**IV. Personal Prayer Log & Journal (For Users' Own Family - Shared Data):**

1.  **Dedicated "Our Family" Section (Accessible by both linked users):**
    * Functions like a special Family Card for the users' own family.
    * **Data Fields:**
        * `ourFamilyName`: String (e.g., "The [User's Last Name] Family")
        * `personalJournalEntries`: List of objects (each with `entryDate`, `entryText`, `tags`).
        * `personalPrayerRequests`: List of prayer request objects:
            * `requestText`: String
            * `status`: String (Dropdown: "Praying," "Answered")
            * `dateAdded`: Timestamp
            * `dateUpdated`: Timestamp (Auto-updated on edit or status change)
            * `notes`: String (Specific notes for this prayer request)
            * `linkedScripture`: String (Optional: a Bible verse specific to this prayer request)
            * `lastPrayedDate`: Timestamp (For "Praying Tonight" rotation)
            * `requesterName`: String (e.g., "John" or "Sarah" - indicates who originally added the request. The prayer for this request in "Praying Tonight" is implicitly by the other user.)
    * **Functionality:**
        * Add, edit, delete shared journal entries and personal prayer requests.
        * When adding/editing personal prayer requests, `lastPrayedDate` can be managed. `lastPrayedBy` is not stored here as it's implicit in the "Praying Tonight" context.
        * Includes "Scripture Suggestion" for personal prayer requests as described above.

**V. Global Features & Views (Shared Data):**

1.  **"Answered Prayers" View/Log:**
    * A dedicated screen listing all "Answered" prayer requests (from other families and the personal log).
    * Displays `familyName` (or "Our Family"), `requestText`, `dateUpdated`. Sortable.
2.  **Search Functionality (Basic):**
    * Search Family Cards by `familyName`, `parents`, `children`, `categoryTag`.
    * Search prayer requests by `requestText` or `notes` across all families and the personal log.
3.  **Quick Add Prayer Request:**
    * Persistent button to quickly add a prayer request, including selection of the `Family Card` (or "Our Family") it belongs to.

**VI. GenAI Feature Considerations:**

* **API Key Management:** Securely manage API keys for OpenAI services using Supabase Edge Functions. Client-side API calls should be avoided for security.
* **User Indication:** Clearly indicate when GenAI is being used to generate suggestions or summaries.
* **Data Privacy:** Be mindful of the data being sent to external APIs. For scripture suggestions, it's prayer text; for summaries, it's prayer texts.

**UI/UX Considerations:**

* Clean, intuitive design, promoting a prayerful atmosphere.
* Easy navigation, especially with shared data considerations.
* Real-time data synchronization between linked devices.

**Technical Stack:**

* **Frontend:** Flutter
* **Backend:** Supabase
    * **Authentication:** Supabase Authentication
    * **Database:** Supabase PostgreSQL (Data structure must support the shared model, e.g., all primary tables like `sharedFamilies`, `sharedOurFamilyLog` could be rooted under a document ID specific to the linked pair of users, or Supabase row-level security heavily utilized to manage access based on a shared link ID stored in each user's profile).
    * **Edge Functions:** For OpenAI API interactions, invitation system (if needed), and potentially complex data migrations or aggregations.
