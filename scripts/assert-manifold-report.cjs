const fs = require('fs');
const path = require('path');

const reportPath = path.join(__dirname, '..', 'dist', 'manifold-validation.json');
const requiredScenarios = new Set(['slots-fillet', 'slots-flat']);

if (!fs.existsSync(reportPath)) {
  console.error(`\n✗ Manifold verification report not found at ${reportPath}`);
  process.exit(1);
}

const raw = fs.readFileSync(reportPath, 'utf8');
const report = JSON.parse(raw);

if (!Array.isArray(report) || report.length === 0) {
  console.error('\n✗ Manifold verification report is empty or malformed');
  process.exit(1);
}

for (const scenario of report) {
  requiredScenarios.delete(scenario?.scenario);
  if (!Array.isArray(scenario?.meshes) || scenario.meshes.length === 0) {
    console.error(`\n✗ Scenario ${scenario?.scenario || '<unknown>'} has no mesh results`);
    process.exit(1);
  }

  const failures = scenario.meshes.filter((mesh) => !mesh.isClosedManifold);
  if (failures.length > 0) {
    const detail = failures
      .map((mesh) => `${mesh.meshName}: boundary=${mesh.boundaryEdges}, nonManifold=${mesh.nonManifoldEdges}`)
      .join('; ');
    console.error(`\n✗ Scenario ${scenario.scenario} failed manifold verification: ${detail}`);
    process.exit(1);
  }
}

if (requiredScenarios.size > 0) {
  console.error(`\n✗ Missing manifold validation scenarios: ${Array.from(requiredScenarios).join(', ')}`);
  process.exit(1);
}

console.log('\n✓ Manifold report verified');