// Vitest for the client. Same Vite config (React plugin) as the app.
//   *.test.ts   pure logic (editor geometry, schemas)
//   *.test.tsx  components, rendered in jsdom with React Testing Library; the
//               API is faked with MSW (src/test/server.ts), never the real server.
// The WebGL (3D) and Konva (2D) canvases don't render in jsdom; their logic is
// tested as pure functions instead.
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.js'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      // The page lives on the fake API's origin, so jsdom's CORS checks don't
      // block MSW's responses.
      environmentOptions: { jsdom: { url: 'http://api.test/' } },
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['src/test/setup.ts'],
      // Fixed values, so tests never depend on the developer's .env.
      env: {
        VITE_API_URL: 'http://api.test/api',
        VITE_FIREBASE_API_KEY: 'test',
        VITE_FIREBASE_AUTH_DOMAIN: 'test.firebaseapp.com',
        VITE_FIREBASE_PROJECT_ID: 'test',
        VITE_FIREBASE_APP_ID: 'test',
      },
      coverage: {
        provider: 'v8',
        include: [
          'src/components/**/*.tsx',
          'src/pages/Login.tsx',
          'src/pages/Signup.tsx',
          'src/services/**/*.ts',
        ],
        // Canvas components jsdom cannot draw: WebGL (react-three-fiber) and Konva.
        // Their logic is tested in editor/; the canvases themselves in e2e/.
        exclude: [
          '**/*.test.*',
          'src/components/Editor/EditorCanvas.tsx',
          'src/components/Editor/LightsFromObjects.tsx',
          // Konva (2D canvas): covered by the Playwright journeys in e2e/.
          'src/components/Editor2D/PlanStage.tsx',
          'src/components/Editor2D/shapes/**',
        ],
        reporter: ['text-summary', 'text', 'html'],
        // Floors at the level reached in step 5; raise them as tests are added.
        thresholds: { statements: 95, branches: 85, functions: 95, lines: 96 },
      },
    },
  }),
)
