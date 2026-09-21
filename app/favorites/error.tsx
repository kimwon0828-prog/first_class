"use client"
import { FavoritesFrame } from "./favorites-frame"
import styles from "./favorites.module.css"
export default function ErrorPage() { return <FavoritesFrame><section className={styles.state} role="alert"><h2>관심수업을 불러오지 못했어요.</h2><p>잠시 후 다시 시도해주세요.</p><button className={styles.action} onClick={() => window.location.reload()}>다시 시도하기</button></section></FavoritesFrame> }
