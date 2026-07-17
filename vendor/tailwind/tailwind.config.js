module.exports = {
  content: ["./index.html"],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: {
          deep: '#020617',    // Slate 950 (Main Stage)
          sidebar: '#0f172a', // Slate 900 (Sidebar)
          border: '#1e293b',  // Slate 800 (Borders)
        },
        brand: {
          sky: '#0ea5e9',    // DEIN ORIGINAL (Sky 500)
          hover: '#38bdf8',  // Heller beim Drüberfahren (Hover Effekt umgedreht)
        },
        slate: {
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        'glow': '0 0 20px -5px rgba(56, 189, 248, 0.3)',
      }
    }
  }
}
