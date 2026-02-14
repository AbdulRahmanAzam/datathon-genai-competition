# NarrativeVerse Website

Frontend for the NarrativeVerse multi-agent storytelling system built with React and Vite.

## Environment Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables

Copy the example environment file:
```bash
copy .env.example .env
```

Edit `.env` and set your backend API URL:
```env
VITE_API_URL=http://localhost:8000
```

If you're running the backend on a different port or domain, update this value accordingly.

### 3. Run Development Server
```bash
npm run dev
```

The website will be available at `http://localhost:5173` (or another port if 5173 is in use).

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint

## Backend Connection

The frontend connects to the backend API through:
- **Development**: Vite proxy (configured in `vite.config.js`) forwards `/api/*` requests to the backend URL specified in `.env`
- **Production**: You'll need to configure your web server to proxy API requests or update the API calls to use absolute URLs

## Tech Stack

- React 19
- Vite 6
- React Router 7
- Tailwind CSS 4
- Framer Motion
- Three.js / React Three Fiber
- Supabase (for data persistence)

---

## React + Vite Template Info

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
