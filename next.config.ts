import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 는 개발 서버의 /_next/* 자산에 대한 교차 출처 요청을 기본 차단합니다.
  // 기준은 서버가 뜬 호스트명(기본 localhost)이라, 127.0.0.1 이나 사설 IP 로
  // 접속하면 JS 청크가 403 이 되고 → 하이드레이션 실패 → 폼이 기본 제출로
  // 넘어가 "버튼을 눌러도 새로고침만 되는" 증상이 납니다.
  // 같은 기기의 127.0.0.1 과 사내망 IP(폰 테스트용)를 허용합니다.
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.0.*", "10.0.*.*"],
};

export default nextConfig;
