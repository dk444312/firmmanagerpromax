const fs = require('fs');

function replaceColor(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/amber-/g, 'emerald-');
  content = content.replace(/text-amber/g, 'text-emerald');
  content = content.replace(/bg-amber/g, 'bg-emerald');
  content = content.replace(/border-amber/g, 'border-emerald');
  content = content.replace(/shadow-amber/g, 'shadow-emerald');
  content = content.replace(/from-amber/g, 'from-emerald');
  content = content.replace(/to-amber/g, 'to-emerald');
  content = content.replace(/via-amber/g, 'via-emerald');
  content = content.replace(/ring-amber/g, 'ring-emerald');
  content = content.replace(/from-\[\#f59e0b\]/g, 'from-emerald-500');
  content = content.replace(/to-\[\#b45309\]/g, 'to-emerald-700');
  content = content.replace(/focus:border-\[\#d97706\]/g, 'focus:border-emerald-600');
  
  content = content.replace(/bg-yellow/g, 'bg-emerald');
  content = content.replace(/text-yellow/g, 'text-emerald');
  content = content.replace(/via-yellow/g, 'via-emerald');

  fs.writeFileSync(filePath, content);
}

replaceColor('src/pages/Drafting.tsx');
replaceColor('src/pages/Atlas.tsx');
console.log('Colors replaced');
