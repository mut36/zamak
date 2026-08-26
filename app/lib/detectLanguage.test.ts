import { describe, expect, it } from 'vitest';
import { detectSubtitleLanguage } from './detectLanguage';

/** 대사만 바꿔 가며 쓰는 3블록짜리 자막. */
function srt(...lines: string[]): string {
  return lines
    .map(
      (line, i) =>
        `${i + 1}\n00:00:0${i},000 --> 00:00:0${i},900\n${line}`,
    )
    .join('\n\n');
}

describe('detectSubtitleLanguage', () => {
  it('한글이 보이면 한국어 — 영어가 섞여 있어도', () => {
    expect(
      detectSubtitleLanguage(
        srt('그래서 내가 거기 갔어', 'OK, 알았어', '뭐라고?'),
      ),
    ).toBe('ko');
  });

  it('가나가 있으면 일본어, 한자만이면 중국어', () => {
    expect(detectSubtitleLanguage(srt('そうですか', '私は行きました'))).toBe(
      'ja',
    );
    expect(detectSubtitleLanguage(srt('我去了那里', '但是没有人'))).toBe('zh');
  });

  it('이탈리아어를 스페인어·프랑스어와 구별한다', () => {
    expect(
      detectSubtitleLanguage(
        srt(
          'Non so che cosa sia successo',
          'Sono andato lì per vedere',
          'Ma non c’era nessuno, capisci?',
          'È più complicato di così',
          'Questo è quello che penso della cosa',
        ),
      ),
    ).toBe('it');
  });

  it('영어·스페인어·프랑스어·독일어도 각각 가른다', () => {
    expect(
      detectSubtitleLanguage(
        srt(
          'I know what you did',
          'And that is the problem with this',
          'You have to tell me what happened',
        ),
      ),
    ).toBe('en');
    expect(
      detectSubtitleLanguage(
        srt(
          'No sé qué pasó con los niños',
          'Pero está aquí, con una carta para ti',
          '¿Qué quieres que haga por ti?',
        ),
      ),
    ).toBe('es');
    expect(
      detectSubtitleLanguage(
        srt(
          'Je ne sais pas ce que vous voulez',
          'Ce n’est pas dans les règles',
          'Il faut être là pour les enfants',
        ),
      ),
    ).toBe('fr');
    expect(
      detectSubtitleLanguage(
        srt(
          'Ich weiß nicht, was der Mann will',
          'Das ist nicht die Wahrheit',
          'Mit einem Kind ist das auch schwer',
        ),
      ),
    ).toBe('de');
  });

  it('근거가 없으면 null — 찍지 않는다', () => {
    expect(detectSubtitleLanguage(srt('8', '...', '♪'))).toBeNull();
    expect(detectSubtitleLanguage('')).toBeNull();
  });

  it('타임코드와 번호는 판정에 안 쓴다', () => {
    // 본문이 비어 있으면 타임코드가 아무리 많아도 근거가 없다.
    expect(
      detectSubtitleLanguage('1\n00:00:01,000 --> 00:00:02,000\n'),
    ).toBeNull();
  });
});
