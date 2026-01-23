# Prayer Tracker Feature One-Pager

## Overview
The **Prayer Tracker** is a household-centric feature designed to help families pray intentionally for one another and for the families they shepherd. It facilitates a structured "rotation" system that ensures no prayer request or family is forgotten, distributing the spiritual load across household members.

## Core Concepts

### 1. Prayer Space (Household)
A **Prayer Space** represents a single household (e.g., "The Smith Family").
- **Creation**: Users create a space from their profile.
- **Membership**: Multiple users (e.g., spouses) can join a space using a unique **Share Code**.
- **Children**: Non-user members (children) can be added to participate in rotations without needing an account.
- **Capacity**: Each member has a "prayer capacity" that influences how many families are assigned to them during a rotation.

### 2. Families (Shepherding List)
Users maintain a list of **Families** they are praying for.
- **Data**: Includes family name, parents' names, children's names, and a category tag (e.g., "Small Group", "Neighbors").
- **Tracking**: The system tracks when each family was last prayed for to prioritize them in future rotations.

### 3. Unified Request System
Prayer requests are unified under a single data structure but serve two distinct contexts:
- **Household Requests**: Personal requests for the user's own household (e.g., "Health for grandma").
- **Family-Specific Requests**: Requests attached to a specific family on the shepherding list (e.g., "The Jones family needs prayer for a new job").
- **Lifecycle**: Requests can be Active, Answered, or Archived.

### 4. The Rotation
The heart of the feature is the **Rotation Workflow**:
1.  **Generate**: The system selects a subset of families and requests based on "last prayed" dates and member capacities.
2.  **Assign**: Families are assigned to specific household members to lead prayer.
3.  **Confirm**: After praying, the user "confirms" the rotation. This updates the `lastPrayedAt` timestamps for all involved families and requests, resetting the cycle.

## Profile Integration

The feature is deeply integrated into the user profile via two key components:

### Family Space Card (`app/profile/components/family-space-card.tsx`)
This component is the administrative hub for the household.
- **Onboarding**: Allows users to create a new space or join an existing one via code.
- **Management**:
    - View and remove members.
    - Add children (with capacity settings).
    - Regenerate share codes.
    - Rename the household.
    - Leave the space (with ownership transfer logic).

### Prayer Journey Card (`app/profile/components/prayer-journey-card.tsx`)
This component provides visual feedback and encouragement.
- **Statistics**: Displays total answered prayers, broken down by "Our family" (household requests) and "Other families" (family-specific requests).
- **Rhythm**: Shows the date the household last prayed together (derived from the last confirmed rotation), encouraging consistency.

## Technical Architecture

### Data Model
- **Prisma Schema**: Relies on `PrayerSpace`, `PrayerMember`, `PrayerFamily`, `PrayerRequest`, and `PrayerRotation` tables (implied).
- **Unified Request Type**: The `UnifiedRequest` type discriminates between household and family requests via a `familyId` field (nullable).

### API Structure (`app/api/prayer-tracker/**`)
- **`/spaces`**: Manage the household entity.
- **`/families`**: CRUD operations for the shepherding list.
- **`/requests`**: Unified endpoint for all prayer requests.
- **`/rotation`**: Logic for computing the next set of assignments.
- **`/rotation/confirm`**: Transactional endpoint to log prayer activity and update timestamps.

### Frontend State
- **React Query**: Used extensively for server state synchronization (`usePrayerSpace`, `useFamilyManager`).
- **Optimistic Updates**: The UI reflects changes immediately (e.g., marking a request as answered) while syncing with the server.
- **Zustand**: Used in `app/profile/ui-store.ts` to manage transient UI state for profile dialogs (renaming, joining, etc.).

## User Flow Summary
1.  **Setup**: User goes to Profile -> Creates "Smith Household" -> Invites Spouse.
2.  **Populate**: User goes to Prayer Tracker -> Adds "Jones Family" -> Adds request for Jones Family.
3.  **Daily Rhythm**:
    - Open Prayer Tracker.
    - Click "Generate Rotation".
    - See that "Dad" is assigned "Jones Family".
    - Pray together.
    - Click "Complete Rotation".
4.  **Review**: Check Profile -> See "Last prayed together: Today".
