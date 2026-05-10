const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, 'src', 'App.vue');
let appContent = fs.readFileSync(appPath, 'utf8');

// Change initial state value
appContent = appContent.replace(
  'customBaseHeight: 10,              // Wysokość własnego podłoża (cm) - domyślnie 10cm',
  'customBaseHeight: 0,               // Wysokość własnego podłoża (cm) - domyślnie 0cm'
);

fs.writeFileSync(appPath, appContent, 'utf8');
console.log('SUCCESS: Changed initial customBaseHeight to 0');
