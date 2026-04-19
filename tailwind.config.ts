import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      backgroundImage: {
        checker:
          'linear-gradient(45deg, #d1d5db 25%, transparent 25%), linear-gradient(-45deg, #d1d5db 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d1d5db 75%), linear-gradient(-45deg, transparent 75%, #d1d5db 75%)',
      },
      backgroundSize: {
        checker: '20px 20px',
      },
      backgroundPosition: {
        checker: '0 0, 0 10px, 10px -10px, -10px 0',
      },
    },
  },
  plugins: [],
};

export default config;
