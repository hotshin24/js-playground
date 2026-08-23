import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { validateLesson } from '../js/lessons.js';

const root = path.resolve(import.meta.dirname, '..');
const lessonDir = path.join(root, 'lessons-v2');
const index = JSON.parse(fs.readFileSync(path.join(lessonDir, 'index.json'), 'utf8'));
const checkedKinds = new Set(['fill', 'wrap', 'write']);
const errors = [];
const counts = new Map();
const seen = new Set();

const complain = (message) => errors.push(message);

for (const item of index.lessons) {
  if (seen.has(item.id)) complain(`중복 ID: ${item.id}`);
  seen.add(item.id);

  const file = path.join(lessonDir, `${item.id}.json`);
  if (!fs.existsSync(file)) {
    complain(`파일 없음: ${item.id}.json`);
    continue;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const lesson = validateLesson(raw, item.id);
    for (const key of ['track', 'order', 'title']) {
      if (lesson[key] !== item[key]) complain(`${item.id}: index의 ${key} 불일치`);
    }

    const code = lesson.steps
      .flatMap((step) => [step.code, step.solutionCode, ...(step.files || []).flatMap((file) => [file.code, file.solutionCode])])
      .join('\n');
    const usesReact = /\bReact(?:DOM)?\b|\buse(?:State|Effect|Memo|Callback|Reducer|Ref|Context)\b|<\/?[A-Za-z]/.test(code);
    if (usesReact && lesson.runtime !== 'react') complain(`${item.id}: React 또는 JSX 코드인데 runtime이 react가 아님`);
    if (Number(item.track.slice(1)) < 5 && lesson.runtime !== 'js') complain(`${item.id}: JavaScript 트랙인데 runtime이 js가 아님`);
    if (lesson.steps[0].kind !== 'read') complain(`${item.id}: 첫 단계가 read가 아님`);
    if (!lesson.steps.some((step) => step.kind === 'run')) complain(`${item.id}: 완성 예제 실행 단계가 없음`);

    const current = counts.get(item.track) || { lessons: 0, steps: 0, checked: 0, asserts: 0 };
    current.lessons += 1;
    current.steps += lesson.steps.length;
    for (const step of lesson.steps) {
      if (checkedKinds.has(step.kind)) current.checked += 1;
      current.asserts += step.asserts.length;
      if (checkedKinds.has(step.kind) && !step.solutionCode && !step.files?.some((file) => file.solutionCode)) {
        complain(`${item.id}: ${step.kind} 단계에 정답 코드가 없음`);
      }
    }
    counts.set(item.track, current);
  } catch (error) {
    complain(`${item.id}: ${error.message}`);
  }
}

for (const track of index.tracks) {
  const items = index.lessons.filter((lesson) => lesson.track === track.id);
  items.forEach((item, index) => {
    if (item.order !== index + 1) complain(`${track.id}: ${index + 1}번 자리에 order ${item.order}`);
  });
}

const files = fs.readdirSync(lessonDir).filter((name) => /^t\d+-\d+\.json$/.test(name));
for (const file of files) {
  const id = file.slice(0, -5);
  if (!seen.has(id)) complain(`index에 없는 파일: ${file}`);
}

console.log('트랙  레슨  단계  직접 작성  검사 항목');
for (const track of index.tracks) {
  const count = counts.get(track.id) || { lessons: 0, steps: 0, checked: 0, asserts: 0 };
  console.log(
    `${track.id.padEnd(5)} ${String(count.lessons).padStart(4)}  ${String(count.steps).padStart(4)}  ${String(count.checked).padStart(9)}  ${String(count.asserts).padStart(9)}`
  );
}

if (errors.length) {
  console.error(`\n${errors.length}개 오류:`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(`\n${index.lessons.length}개 레슨 구조 검사 통과`);
}
