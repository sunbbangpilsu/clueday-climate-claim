// 백엔드 주소. 백엔드가 화면까지 함께 띄운 경우(포트 8000)는 같은 주소를 쓰고,
// 화면만 따로 띄운 경우(예: python -m http.server 5500)는 로컬 백엔드를 부른다.
window.API_BASE = location.port === "8000" ? "" : "http://localhost:8000";
