// Pemeriksa cepat tampilan: sintaks tiap berkas + kecocokan impor antar modul.
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const dir = 'public/assets/js';
const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
let bad = 0;

for (const f of files) {
  try { execFileSync(process.execPath, ['--check', `${dir}/${f}`], { stdio: 'pipe' }); }
  catch (e) { console.log(`SINTAKS RUSAK: ${f}\n${String(e.stderr).split('\n').slice(0, 4).join('\n')}`); bad++; }
}

const exportsOf = (src) => {
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const p = part.trim();
      if (p) names.add(p.split(/\s+as\s+/).pop().trim());
    }
  }
  return names;
};
const cache = {};
for (const f of files) {
  const src = readFileSync(`${dir}/${f}`, 'utf8');
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/([\w.-]+)'/g)) {
    const target = m[2];
    try { cache[target] ??= exportsOf(readFileSync(`${dir}/${target}`, 'utf8')); }
    catch { console.log(`MASALAH: ${f} mengimpor berkas yang tidak ada: ${target}`); bad++; continue; }
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name && !cache[target].has(name)) { console.log(`MASALAH: ${f} mengimpor "${name}" dari ${target}, tetapi tidak diekspor`); bad++; }
    }
  }
}
console.log(bad ? `${bad} masalah ditemukan` : `Semua ${files.length} berkas lolos (sintaks dan impor cocok)`);
process.exit(bad ? 1 : 0);
