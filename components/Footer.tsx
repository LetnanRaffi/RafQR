import { Logo } from './Logo';

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <span className="site-footer-mark"><Logo size={15} /></span>
          <div>
            <strong>QRData</strong>
            <p>© {new Date().getFullYear()} QRData</p>
          </div>
        </div>
        <p className="site-footer-credit">
          Dikembangkan oleh <a href="https://raffitech.biz.id" target="_blank" rel="noopener noreferrer">RaffiTech Solutions</a>
        </p>
      </div>
    </footer>
  );
}
