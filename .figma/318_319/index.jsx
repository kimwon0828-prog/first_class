import React from 'react';

import styles from './index.module.scss';

const Component = () => {
  return (
    <div className={styles.a8}>
      <div className={styles.statusBar}>
        <div className={styles.aStatusBarTime}>
          <p className={styles.aTime}>9:41</p>
        </div>
        <div className={styles.rightSide}>
          <img
            src="../image/mo1145jg-hhtxmlt.svg"
            className={styles.iconMobileSignal}
          />
          <img src="../image/mo1145jg-2zzamzj.svg" className={styles.wifi} />
          <img
            src="../image/mo1145jg-s5bojhb.svg"
            className={styles.aStatusBarBattery}
          />
        </div>
      </div>
      <img src="../image/mo1145jg-lib7n0d.png" className={styles.expandMore} />
      <p className={styles.a}>로그인</p>
      <div className={styles.frame2147223398}>
        <div className={styles.frame2147223397}>
          <img src="../image/mo1145jk-39cmb94.png" className={styles.a13} />
          <p className={styles.a2}>
            학원 선택의 시작은 <br />
            상담이 아니라 첫 수업이어야 합니다.
          </p>
        </div>
        <p className={styles.a3}>회원 서비스 이용을 위해 로그인 해주세요.</p>
      </div>
      <div className={styles.frame2147223401}>
        <div className={styles.frame2147223399}>
          <p className={styles.a4}>아이디</p>
          <div className={styles.line1} />
        </div>
        <div className={styles.frame2147223399}>
          <p className={styles.a4}>비밀번호</p>
          <div className={styles.line1} />
        </div>
      </div>
      <div className={styles.frame2147223402}>
        <p className={styles.a5}>아이디 찾기</p>
        <div className={styles.autoWrapper}>
          <div className={styles.line35} />
        </div>
        <p className={styles.a5}>비밀번호 찾기</p>
        <div className={styles.autoWrapper}>
          <div className={styles.line35} />
        </div>
        <p className={styles.a5}>회원가입</p>
      </div>
      <div className={styles.a7}>
        <p className={styles.a6}>로그인</p>
      </div>
      <div className={styles.homeIndicator2}>
        <div className={styles.homeIndicator} />
      </div>
    </div>
  );
}

export default Component;
