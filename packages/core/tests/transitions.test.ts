import { describe, it, expect } from 'vitest';
import {
  WorkflowPhase,
  isValidTransition,
  getValidNextPhases,
  isTerminalPhase,
  InvalidTransitionError,
} from '../src/index.js';

describe('transitions', () => {
  describe('isValidTransition', () => {
    it('allows the full happy path', () => {
      const happyPath = [
        WorkflowPhase.Created,
        WorkflowPhase.Planning,
        WorkflowPhase.Planned,
        WorkflowPhase.Executing,
        WorkflowPhase.Executed,
        WorkflowPhase.Verifying,
        WorkflowPhase.Verified,
        WorkflowPhase.Done,
      ];

      for (let i = 0; i < happyPath.length - 1; i++) {
        expect(isValidTransition(happyPath[i], happyPath[i + 1])).toBe(true);
      }
    });

    it('allows failure from any non-terminal phase', () => {
      const activePhases = [
        WorkflowPhase.Created,
        WorkflowPhase.Planning,
        WorkflowPhase.Planned,
        WorkflowPhase.Executing,
        WorkflowPhase.Executed,
        WorkflowPhase.Verifying,
        WorkflowPhase.Verified,
      ];

      for (const phase of activePhases) {
        expect(isValidTransition(phase, WorkflowPhase.Failed)).toBe(true);
      }
    });

    it('allows retry from Failed to Planning', () => {
      expect(isValidTransition(WorkflowPhase.Failed, WorkflowPhase.Planning)).toBe(true);
    });

    it('allows retry from Failed to Executing', () => {
      expect(isValidTransition(WorkflowPhase.Failed, WorkflowPhase.Executing)).toBe(true);
    });

    it('allows re-execute from Verified', () => {
      expect(isValidTransition(WorkflowPhase.Verified, WorkflowPhase.Executing)).toBe(true);
    });

    it('rejects failure from Done', () => {
      expect(isValidTransition(WorkflowPhase.Done, WorkflowPhase.Failed)).toBe(false);
    });

    it('rejects skipping phases', () => {
      expect(isValidTransition(WorkflowPhase.Created, WorkflowPhase.Executing)).toBe(false);
    });

    it('rejects backward transitions (non-retry)', () => {
      expect(isValidTransition(WorkflowPhase.Planned, WorkflowPhase.Planning)).toBe(false);
    });

    it('rejects transitions from Done', () => {
      expect(isValidTransition(WorkflowPhase.Done, WorkflowPhase.Planning)).toBe(false);
    });
  });

  describe('getValidNextPhases', () => {
    it('returns Planning and Failed for Created', () => {
      const next = getValidNextPhases(WorkflowPhase.Created);
      expect(next).toContain(WorkflowPhase.Planning);
      expect(next).toContain(WorkflowPhase.Failed);
      expect(next).toHaveLength(2);
    });

    it('returns nothing for Done', () => {
      expect(getValidNextPhases(WorkflowPhase.Done)).toHaveLength(0);
    });

    it('returns Planning and Executing for Failed (retry paths)', () => {
      const next = getValidNextPhases(WorkflowPhase.Failed);
      expect(next).toContain(WorkflowPhase.Planning);
      expect(next).toContain(WorkflowPhase.Executing);
    });
  });

  describe('isTerminalPhase', () => {
    it('Done is terminal', () => {
      expect(isTerminalPhase(WorkflowPhase.Done)).toBe(true);
    });

    it('Failed is terminal', () => {
      expect(isTerminalPhase(WorkflowPhase.Failed)).toBe(true);
    });

    it('Executing is not terminal', () => {
      expect(isTerminalPhase(WorkflowPhase.Executing)).toBe(false);
    });
  });

  describe('InvalidTransitionError', () => {
    it('includes from/to in message', () => {
      const err = new InvalidTransitionError(WorkflowPhase.Done, WorkflowPhase.Planning);
      expect(err.message).toContain('done');
      expect(err.message).toContain('planning');
      expect(err.from).toBe(WorkflowPhase.Done);
      expect(err.to).toBe(WorkflowPhase.Planning);
    });
  });
});
