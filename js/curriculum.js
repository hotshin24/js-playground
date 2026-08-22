const params = typeof location === 'undefined' ? null : new URLSearchParams(location.search);

export const isV2Preview = Boolean(params && params.get('curriculum') === 'v2');
export const lessonRoot = isV2Preview ? 'lessons-v2' : 'lessons';
export const storageKey = isV2Preview ? 'js-playground:v2-preview' : 'js-playground:v1';
