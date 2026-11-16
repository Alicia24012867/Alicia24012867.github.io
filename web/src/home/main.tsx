import Home from './Home';
import { keepForOffline } from '../offline';
import { showPage } from '../pages';
import '../styles/global.css';
import './home.css';

keepForOffline();

showPage(import.meta.url, () => <Home />);
