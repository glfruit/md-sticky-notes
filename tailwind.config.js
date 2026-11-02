/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // 设计系统见 design-system/md-sticky-notes/MASTER.md
      fontFamily: {
        sans: [
          '"Plus Jakarta Sans"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'system-ui',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        accent: {
          DEFAULT: '#D97706',
          hover: '#B45309',
        },
      },
      borderRadius: {
        xl: 'calc(0.625rem + 4px)',
        lg: '0.625rem',
        md: 'calc(0.625rem - 2px)',
      },
    },
  },
  plugins: [],
}
