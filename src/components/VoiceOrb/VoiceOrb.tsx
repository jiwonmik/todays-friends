import { TranslateIcon } from "../icons";
import styles from "./VoiceOrb.module.css";

interface VoiceOrbProps {
  idle?: boolean;
}

/** The swirling "voice orb" itself — purely visual. */
export function VoiceOrb({ idle }: VoiceOrbProps) {
  return (
    <span
      className={idle ? `${styles.voiceOrb} ${styles.voiceOrbIdle}` : styles.voiceOrb}
      aria-hidden="true"
    >
      <span className={styles.voiceOrbBlobA} />
      <span className={styles.voiceOrbBlobB} />
      <span className={styles.voiceOrbBlobC} />
      <span className={styles.voiceOrbTint} />
    </span>
  );
}

interface VoiceOrbTranslateButtonProps {
  onTranslate: () => void;
  disabled: boolean;
}

/**
 * The orb while a speaker is being listened to, doubling as the "translate
 * now" control: it looks the same as the plain orb, and on hover/focus a
 * translate icon fades in over an accent-tinted wash. Disabled while
 * nothing is being recognized.
 */
export function VoiceOrbTranslateButton({ onTranslate, disabled }: VoiceOrbTranslateButtonProps) {
  return (
    <button
      type="button"
      className={styles.voiceOrbButton}
      onClick={onTranslate}
      disabled={disabled}
      aria-label="지금 번역하기"
    >
      <VoiceOrb />
      <span className={styles.voiceOrbIcon}>
        <TranslateIcon />
      </span>
    </button>
  );
}
