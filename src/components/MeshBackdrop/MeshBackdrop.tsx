import styles from "./MeshBackdrop.module.css";

interface MeshBackdropProps {
  /** CSS `background-image` value of the current mesh theme. */
  background: string;
}

export function MeshBackdrop({ background }: MeshBackdropProps) {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <div className={styles.backdropGradient} style={{ backgroundImage: background }} />
      <div className={styles.backdropGrain} />
    </div>
  );
}
