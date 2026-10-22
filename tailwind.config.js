/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      borderRadius: {
        // 与原 shadcn 主题的圆角观感保持一致
        xl: 'calc(0.625rem + 4px)',
        lg: '0.625rem',
        md: 'calc(0.625rem - 2px)',
      },
    },
  },
  plugins: [],
}
