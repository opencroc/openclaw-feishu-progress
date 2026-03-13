/**
 * VSCode extension scaffold for OpenCroc.
 *
 * This module provides the extension activation logic, command definitions,
 * and tree view data provider for the OpenCroc sidebar panel.
 *
 * To build:
 *   1. Copy `vscode-extension/` from the opencroc repo
 *   2. Run `npm install && npm run compile`
 *   3. Press F5 in VS Code to launch the Extension Development Host
 */

// ===== Extension Manifest Types (subset of vscode.d.ts for portability) =====

export interface ExtensionCommand {
  command: string;
  title: string;
  category: string;
}

export interface TreeItem {
  label: string;
  description?: string;
  tooltip?: string;
  iconId?: string;
  children?: TreeItem[];
  command?: string;
}

// ===== Commands =====

export const EXTENSION_ID = 'opencroc.opencroc';

export const COMMANDS: ExtensionCommand[] = [
  { command: 'opencroc.init', title: 'Initialize Project', category: 'OpenCroc' },
  { command: 'opencroc.generate', title: 'Generate Tests', category: 'OpenCroc' },
  { command: 'opencroc.generateModule', title: 'Generate Tests for Module...', category: 'OpenCroc' },
  { command: 'opencroc.test', title: 'Run Tests', category: 'OpenCroc' },
  { command: 'opencroc.testModule', title: 'Run Tests for Module...', category: 'OpenCroc' },
  { command: 'opencroc.validate', title: 'Validate Configuration', category: 'OpenCroc' },
  { command: 'opencroc.heal', title: 'Self-Heal Failures', category: 'OpenCroc' },
  { command: 'opencroc.openReport', title: 'Open Report', category: 'OpenCroc' },
  { command: 'opencroc.ci', title: 'Generate CI Template', category: 'OpenCroc' },
];

// ===== Tree View Data =====

export function buildModuleTree(modules: string[]): TreeItem[] {
  return modules.map((mod) => ({
    label: mod,
    description: 'module',
    iconId: 'symbol-module',
    children: [
      { label: 'Generate Tests', command: 'opencroc.generateModule', iconId: 'play' },
      { label: 'Run Tests', command: 'opencroc.testModule', iconId: 'testing-run-icon' },
      { label: 'View ER Diagram', command: 'opencroc.openReport', iconId: 'graph' },
    ],
  }));
}

export function buildStatusTree(stats: {
  modules: number;
  tables: number;
  relations: number;
  generatedFiles: number;
  errors: number;
}): TreeItem[] {
  return [
    { label: `Modules: ${stats.modules}`, iconId: 'symbol-module' },
    { label: `Tables: ${stats.tables}`, iconId: 'database' },
    { label: `Relations: ${stats.relations}`, iconId: 'git-merge' },
    { label: `Generated: ${stats.generatedFiles} files`, iconId: 'file-code' },
    {
      label: stats.errors > 0 ? `Errors: ${stats.errors}` : 'No errors',
      iconId: stats.errors > 0 ? 'error' : 'pass',
    },
  ];
}

// ===== Package.json Generator =====

export function generateExtensionManifest(): Record<string, unknown> {
  return {
    name: 'opencroc',
    displayName: 'OpenCroc',
    description: 'AI-native E2E testing — generate, run, and self-heal tests from VS Code',
    version: '0.1.0',
    publisher: 'opencroc',
    license: 'MIT',
    repository: { type: 'git', url: 'https://github.com/opencroc/opencroc' },
    engines: { vscode: '^1.85.0' },
    categories: ['Testing'],
    keywords: ['e2e', 'testing', 'playwright', 'ai', 'self-healing'],
    activationEvents: ['workspaceContains:opencroc.config.ts', 'workspaceContains:opencroc.config.js'],
    main: './out/extension.js',
    contributes: {
      commands: COMMANDS.map((c) => ({
        command: c.command,
        title: c.title,
        category: c.category,
      })),
      viewsContainers: {
        activitybar: [
          {
            id: 'opencroc',
            title: 'OpenCroc',
            icon: 'resources/opencroc.svg',
          },
        ],
      },
      views: {
        opencroc: [
          { id: 'opencroc.status', name: 'Status' },
          { id: 'opencroc.modules', name: 'Modules' },
        ],
      },
      configuration: {
        title: 'OpenCroc',
        properties: {
          'opencroc.autoGenerate': {
            type: 'boolean',
            default: false,
            description: 'Automatically regenerate tests on file save',
          },
          'opencroc.reportFormat': {
            type: 'string',
            default: 'html',
            enum: ['html', 'json', 'markdown'],
            description: 'Default report format',
          },
        },
      },
    },
  };
}

/**
 * Generate the extension's entry point (activation function).
 * Returns TypeScript source code for `src/extension.ts`.
 */
export function generateExtensionEntrypoint(): string {
  return `import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const run = promisify(exec);

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel('OpenCroc');

  async function runCommand(cmd: string) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }
    outputChannel.show();
    outputChannel.appendLine(\`> \${cmd}\`);
    try {
      const { stdout, stderr } = await run(cmd, { cwd: workspaceFolder.uri.fsPath });
      if (stdout) outputChannel.appendLine(stdout);
      if (stderr) outputChannel.appendLine(stderr);
      vscode.window.showInformationMessage(\`OpenCroc: \${cmd} completed\`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      outputChannel.appendLine(\`Error: \${message}\`);
      vscode.window.showErrorMessage(\`OpenCroc: \${message}\`);
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('opencroc.init', () => runCommand('npx opencroc init --yes')),
    vscode.commands.registerCommand('opencroc.generate', () => runCommand('npx opencroc generate --all')),
    vscode.commands.registerCommand('opencroc.test', () => runCommand('npx opencroc test')),
    vscode.commands.registerCommand('opencroc.validate', () => runCommand('npx opencroc validate')),
    vscode.commands.registerCommand('opencroc.heal', () => runCommand('npx opencroc heal')),
    vscode.commands.registerCommand('opencroc.ci', async () => {
      const platform = await vscode.window.showQuickPick(['github', 'gitlab'], {
        placeHolder: 'Select CI platform',
      });
      if (platform) {
        await runCommand(\`npx opencroc ci --platform=\${platform}\`);
      }
    }),
    vscode.commands.registerCommand('opencroc.generateModule', async () => {
      const mod = await vscode.window.showInputBox({ prompt: 'Module name' });
      if (mod) await runCommand(\`npx opencroc generate --module=\${mod}\`);
    }),
    vscode.commands.registerCommand('opencroc.testModule', async () => {
      const mod = await vscode.window.showInputBox({ prompt: 'Module name' });
      if (mod) await runCommand(\`npx opencroc test --module=\${mod}\`);
    }),
  );

  outputChannel.appendLine('OpenCroc extension activated');
}

export function deactivate() {}
`;
}
