const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '../..');
const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

// Watch the entire monorepo so Metro sees workspace packages
config.watchFolders = [workspaceRoot];

// Resolve modules from the workspace root first, then the project root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Ensure symlinked packages are resolved correctly (pnpm uses symlinks)
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
