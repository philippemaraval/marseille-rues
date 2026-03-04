#!/usr/bin/env node
/**
 * Build script: minifies main.js, data_rules.js, and style.css
 * Usage: npm run build
 * Requires: npm install --save-dev terser clean-css-cli
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function fileSize(filePath) {
    const stat = fs.statSync(filePath);
    return (stat.size / 1024).toFixed(1) + ' KB';
}

console.log('🔨 Building Camino...\n');

// Minify JS files with Terser
const jsFiles = ['main.js', 'data_rules.js', 'sw.js'];
jsFiles.forEach(file => {
    const src = path.join(ROOT, file);
    if (!fs.existsSync(src)) return;
    const sizeBefore = fileSize(src);
    try {
        execSync(`npx terser "${src}" --compress --mangle --output "${src}.min"`, { cwd: ROOT });
        const sizeAfter = fileSize(src + '.min');
        // Replace original with minified
        fs.copyFileSync(src + '.min', src);
        fs.unlinkSync(src + '.min');
        console.log(`  ✅ ${file}: ${sizeBefore} → ${sizeAfter}`);
    } catch (e) {
        console.error(`  ❌ ${file}: minification failed`, e.message);
    }
});

// Minify CSS with clean-css
const cssFiles = ['style.css'];
cssFiles.forEach(file => {
    const src = path.join(ROOT, file);
    if (!fs.existsSync(src)) return;
    const sizeBefore = fileSize(src);
    try {
        execSync(`npx cleancss -o "${src}.min" "${src}"`, { cwd: ROOT });
        const sizeAfter = fileSize(src + '.min');
        fs.copyFileSync(src + '.min', src);
        fs.unlinkSync(src + '.min');
        console.log(`  ✅ ${file}: ${sizeBefore} → ${sizeAfter}`);
    } catch (e) {
        console.error(`  ❌ ${file}: minification failed`, e.message);
    }
});

console.log('\n✨ Build complete!');
