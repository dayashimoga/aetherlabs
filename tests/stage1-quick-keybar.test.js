'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ContextAwareQuickKeyEngine = require('../public/js/quickKeyEngine');

test('Subphase 1.2.2: ContextAwareQuickKeyEngine prevents "describe kubectl" bug on empty line', () => {
  // Empty line: tapping 'describe' must automatically prepend 'kubectl'
  const res1 = ContextAwareQuickKeyEngine.insertToken('', 0, 'describe');
  assert.equal(res1.line, 'kubectl describe ');
  assert.equal(res1.cursorPos, 'kubectl describe '.length);

  // Tapping 'get' on empty line
  const res2 = ContextAwareQuickKeyEngine.insertToken('', 0, 'get');
  assert.equal(res2.line, 'kubectl get ');

  // Tapping 'pods' on empty line
  const res3 = ContextAwareQuickKeyEngine.insertToken('', 0, 'pods');
  assert.equal(res3.line, 'kubectl get pods ');

  // Tapping 'apply -f' on empty line
  const res4 = ContextAwareQuickKeyEngine.insertToken('', 0, 'apply -f');
  assert.equal(res4.line, 'kubectl apply -f ');

  // Tapping '-n' on empty line
  const res5 = ContextAwareQuickKeyEngine.insertToken('', 0, '-n');
  assert.equal(res5.line, 'kubectl get pods -n ');

  // Tapping 'kubectl' on empty line
  const res6 = ContextAwareQuickKeyEngine.insertToken('', 0, 'kubectl');
  assert.equal(res6.line, 'kubectl ');
});

test('Subphase 1.2.2: ContextAwareQuickKeyEngine prevents "kubectl kubectl" and out-of-order duplicates', () => {
  // Line already has 'kubectl '
  const res1 = ContextAwareQuickKeyEngine.insertToken('kubectl ', 8, 'kubectl');
  assert.equal(res1.line, 'kubectl ');

  // Line has 'kubectl describe' -> tapping 'kubectl' keeps as is
  const res2 = ContextAwareQuickKeyEngine.insertToken('kubectl describe', 16, 'kubectl');
  assert.equal(res2.line, 'kubectl describe ');

  // Line has 'kubectl describe ' -> tapping 'describe' keeps as is
  const res3 = ContextAwareQuickKeyEngine.insertToken('kubectl describe ', 17, 'describe');
  assert.equal(res3.line, 'kubectl describe ');
});

test('Subphase 1.2.2: ContextAwareQuickKeyEngine intelligent verb replacement', () => {
  // Line has 'kubectl get ' -> tapping 'describe' cleanly replaces 'get' with 'describe'
  const res1 = ContextAwareQuickKeyEngine.insertToken('kubectl get ', 12, 'describe');
  assert.equal(res1.line, 'kubectl describe ');

  // Line has 'kubectl get pods' -> tapping 'describe' replaces 'get' with 'describe'
  const res2 = ContextAwareQuickKeyEngine.insertToken('kubectl get pods', 16, 'describe');
  assert.equal(res2.line, 'kubectl describe pods ');

  // Line has 'kubectl describe pods' -> tapping 'get' replaces 'describe' with 'get'
  const res3 = ContextAwareQuickKeyEngine.insertToken('kubectl describe pods', 21, 'get');
  assert.equal(res3.line, 'kubectl get pods ');
});

test('Subphase 1.2.2: ContextAwareQuickKeyEngine resource chaining and flag syntax', () => {
  // Line has 'kubectl get pods' -> tapping 'svc' produces comma-separated multi-resource 'kubectl get pods,svc '
  const res1 = ContextAwareQuickKeyEngine.insertToken('kubectl get pods', 16, 'svc');
  assert.equal(res1.line, 'kubectl get pods,svc ');

  // Line has 'kubectl get pods' -> tapping '-n' produces 'kubectl get pods -n '
  const res2 = ContextAwareQuickKeyEngine.insertToken('kubectl get pods', 16, '-n');
  assert.equal(res2.line, 'kubectl get pods -n ');

  // Tapping '-n' again does not duplicate
  const res3 = ContextAwareQuickKeyEngine.insertToken('kubectl get pods -n ', 20, '-n');
  assert.equal(res3.line, 'kubectl get pods -n ');
});

test('Subphase 1.2.2: ContextAwareQuickKeyEngine pipe and grep filter wrapping', () => {
  // Line has 'kubectl get pods' -> tapping '|' produces 'kubectl get pods | '
  const res1 = ContextAwareQuickKeyEngine.insertToken('kubectl get pods', 16, '|');
  assert.equal(res1.line, 'kubectl get pods | ');

  // Line has 'kubectl get pods' -> tapping 'grep' auto-inserts pipe: 'kubectl get pods | grep '
  const res2 = ContextAwareQuickKeyEngine.insertToken('kubectl get pods', 16, 'grep');
  assert.equal(res2.line, 'kubectl get pods | grep ');

  // Line has 'kubectl get pods |' -> tapping 'grep' produces 'kubectl get pods | grep '
  const res3 = ContextAwareQuickKeyEngine.insertToken('kubectl get pods |', 18, 'grep');
  assert.equal(res3.line, 'kubectl get pods | grep ');

  // Tapping 'grep' again does not duplicate
  const res4 = ContextAwareQuickKeyEngine.insertToken('kubectl get pods | grep ', 25, 'grep');
  assert.equal(res4.line, 'kubectl get pods | grep ');
});

