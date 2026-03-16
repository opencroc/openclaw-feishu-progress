/**
 * Scanner Module — Public API
 */
export { detectProject, type LanguageDetectionResult } from './language-detector.js';
export { scanProject, type ScanOptions } from './project-scanner.js';
export { cloneAndScan, type CloneOptions } from './github-cloner.js';
