try { document.documentElement.dataset.theme = JSON.parse(localStorage.getItem('fansxe.community.v1') || '{}').theme === 'dark' ? 'dark' : 'light'; } catch {}
tailwind.config = {
        theme: {
          extend: {
            colors: {
              'vip-primary': 'rgb(var(--vip-primary) / <alpha-value>)',
              'vip-hover': 'rgb(var(--vip-hover) / <alpha-value>)',
              'vip-dark': 'rgb(var(--vip-dark) / <alpha-value>)',
              'vip-gray': 'rgb(var(--vip-gray) / <alpha-value>)',
              'vip-bg': 'rgb(var(--vip-bg) / <alpha-value>)',
              'vip-border': 'rgb(var(--vip-border) / <alpha-value>)',
            },
            fontFamily: {
              sans: ['Inter', 'system-ui', 'sans-serif'],
            }
          }
        }
      }
