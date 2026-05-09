import type { NextConfig } from "next";

/**
 * 모바일 등 LAN에서 `http://<PC IP>:3000` 으로 접속할 때
 * Next.js dev 서버가 스크립트/chunk 요청 Origin을 검사합니다.
 * 본인 PC의 IPv4 주소를 넣어 두면 hydration 실패( JS 미실행 )를 줄일 수 있습니다.
 * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
 */
const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.45.38",
    "localhost",
  ],
};

export default nextConfig;
