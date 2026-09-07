import { describe,it,expect } from 'vitest';
import { toGameQuestion } from '@/domain/question';
import { DEMO_QUESTIONS } from '@/infrastructure/mock/fixtures';
describe('display results',()=>{it('ships owner count',()=>expect(toGameQuestion(DEMO_QUESTIONS[0]!).d).toBeGreaterThanOrEqual(2000));});
