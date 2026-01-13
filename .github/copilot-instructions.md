# Copilot Instructions for faculty-schedules

## Project Overview
This is a React + Firebase dashboard for Baylor University Human Sciences & Design, focused on faculty, staff, student, and room scheduling, directory management, and analytics. The app uses a normalized Firestore database and modular React architecture.

## Architecture & Data Flow
- **Contexts**: All global state and CRUD operations are managed via React Contexts in `src/contexts/`. Key providers: `DataContext`, `UIContext`, `AuthContext`, `PeopleContext`, `ScheduleContext`, `AppConfigContext`, `TutorialContext`.
- **Custom Hooks**: Business logic for CRUD and operations is encapsulated in hooks in `src/hooks/` (e.g., `usePeopleOperations`, `useScheduleOperations`). Components should use these hooks, not direct Firestore calls.
- **Components**: Major features are split into directories under `src/components/` (e.g., `scheduling/`, `analytics/`, `people/`, `administration/`). Use composition and props for feature extension.
- **Firebase Integration**: All Firebase setup is in `src/firebase.js`. Use emulators in development (`npm run emulators`).
- **Routing & Layout**: Main layout and navigation are in `src/App.jsx`. Navigation config is centralized and uses icons from `lucide-react`.

## Developer Workflows
- **Start Dev Server**: `npm run dev` (uses Vite)
- **Build**: `npm run build`
- **Lint**: `npm run lint`
- **Test**: `npm run test` (Vitest)
- **Firebase Emulators**: `npm run emulators` (local Firestore/Auth/Storage)
- **Deploy**: `npm run deploy` (see also `deploy:hosting`, `deploy:firestore`)

## Project-Specific Patterns
- **Data Access**: Always use context hooks (e.g., `useData()`, `useUI()`) for state and operations. Never prop drill or bypass context.
- **CRUD Operations**: Use custom hooks for all create/update/delete logic. Example: `usePeopleOperations` for faculty/staff/student changes.
- **UI State**: Use `UIContext` for notifications, sidebar, modals, and pinned pages.
- **Directory Patterns**: Directory components (e.g., `FacultyDirectory`, `PersonDirectory`) receive config/data/handlers via props and use shared utilities from `src/utils/directoryUtils.js`.
- **Semester/Filtering**: Semester selection and filtering is managed in `DataContext` and passed to relevant components.
- **Import/Export**: Data import/export tools are in `src/components/administration/` and `src/utils/dataImportUtils.js`.

## External Integrations
- **Firebase**: Firestore, Auth, Storage (see `src/firebase.js`).
- **Vercel Analytics**: Used in `src/main.jsx`.
- **TailwindCSS**: For styling, with custom config in `tailwind.config.js`.

## Key Files & Directories
- `src/App.jsx`: Main layout, navigation, routing
- `src/firebase.js`: Firebase setup
- `src/contexts/`: Global state/providers
- `src/hooks/`: Business logic hooks
- `src/components/`: Feature components
- `src/utils/`: Shared utilities
- `package.json`: Scripts, dependencies

## Example Patterns
- To update a faculty member, use `usePeopleOperations().handleFacultyUpdate` from a directory component.
- To show a notification, use `useUI().showNotification`.
- To access schedule data, use `useData().scheduleData`.

---
If any section is unclear or missing, please provide feedback for further refinement.