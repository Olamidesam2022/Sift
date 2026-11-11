/** @type {import('tailwindcss').Config} */
export default { content: ['./index.html', './src/**/*.{ts,tsx}'], theme: 
    { extend: { colors: { ink: '#202923', paper: '#f8f7f2', emerald: '#176b4b', amber: '#e9a83b', 
        coral: '#dc705a' }, fontFamily: { heading: ['Plus Jakarta Sans', 'sans-serif'], body: ['DM Sans', 
            'sans-serif'] } } }, plugins: [] }
