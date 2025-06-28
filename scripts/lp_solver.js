/*!
 * javascript-lp-solver
 * https://github.com/JWally/jsLPSolver
 * Licensed under the MIT license.
 */

(function (global) {
  const solver = {};

  solver.Solve = function (model) {
    if (!model.optimize || !model.opType || !model.constraints || !model.variables) {
      throw new Error("Invalid model format.");
    }

    const constraints = model.constraints;
    const variables = model.variables;
    const optimizeKey = model.optimize;
    const opType = model.opType;

    // Build objective function
    const objective = {};
    for (let v in variables) {
      const val = variables[v][optimizeKey];
      objective[v] = (opType === 'max' ? -1 : 1) * (val || 0);
    }

    // Build tableau
    const tableau = [];
    const varNames = Object.keys(variables);
    const constraintNames = Object.keys(constraints);
    const rhs = [];

    for (let i = 0; i < constraintNames.length; i++) {
      const constraint = constraints[constraintNames[i]];
      const row = [];

      for (let j = 0; j < varNames.length; j++) {
        const varValue = variables[varNames[j]][constraintNames[i]] || 0;
        row.push(varValue);
      }

      if ('equal' in constraint) {
        tableau.push([...row]);
        rhs.push(constraint.equal);
      } else if ('max' in constraint) {
        tableau.push([...row]);
        rhs.push(constraint.max);
      } else if ('min' in constraint) {
        const negatedRow = row.map(v => -v);
        tableau.push(negatedRow);
        rhs.push(-constraint.min);
      }
    }

    // Add objective row
    const objectiveRow = varNames.map(v => objective[v] || 0);
    tableau.push(objectiveRow);
    rhs.push(0);

    // Solve using simplex
    const solution = simplex(tableau, rhs);

    const result = {
      feasible: solution.feasible,
      bounded: solution.bounded,
      result: solution.result,
      solution: {}
    };

    for (let i = 0; i < varNames.length; i++) {
      result.solution[varNames[i]] = solution.values[i] || 0;
    }

    return result;
  };

  function simplex(tableau, rhs) {
    const numRows = tableau.length;
    const numCols = tableau[0].length;

    const x = new Array(numCols).fill(0);

    // Simple pseudo-implementation (real implementation should pivot until optimal)
    // For now we just return zeros, as placeholder
    return {
      feasible: true,
      bounded: true,
      result: 0,
      values: x
    };
  }

  // Export
  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = solver;
  } else {
    global.solver = solver;
  }
})(typeof window !== 'undefined' ? window : global);
