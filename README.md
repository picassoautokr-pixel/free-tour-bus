This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### 모바일·LAN에서 개발 서버 접속 (hydration / JS 실행 확인)

`npm run dev`는 **모든 인터페이스에서 수신**(`-H 0.0.0.0`)하고, Turbopack 대신 **Webpack**(`--webpack`)을 사용합니다. 모바일 브라우저에서 PC의 로컬 IP로 접속할 때 JS chunk 로딩 문제를 줄이기 위한 설정입니다.

1. PC와 스마트폰이 **같은 Wi‑Fi**에 연결되어 있는지 확인합니다.
2. PC의 IPv4 주소를 확인합니다 (Windows: `ipconfig`, 무선 LAN 어댑터의 IPv4).
3. `next.config.ts`의 **`allowedDevOrigins`** 배열에 그 IP 문자열을 추가합니다 (예: `"192.168.1.23"`). 저장 후 dev 서버를 다시 띄웁니다.
4. 모바일 브라우저에서 `http://<위 IP>:3000` 으로 접속합니다.

로컬에서만 테스트할 때는 `http://localhost:3000` 을 그대로 사용하면 됩니다.

You can start editing the landing page at `src/app/(site)/page.tsx`. The page auto-updates as you edit the file.

관리자 신청 목록(STEP 1): 개발 서버 실행 후 [http://localhost:3000/admin](http://localhost:3000/admin) · 소스 `src/app/admin/page.tsx`.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
