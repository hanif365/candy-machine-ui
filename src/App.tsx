import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Landing from './Landing';
import Main from './Main';

const App = () => {
  

  return (
    <BrowserRouter>
    <Routes>
      <Route path="/" element={<Landing />}>
      </Route>

      <Route path="/main" element={<Main />}>
      </Route>
    </Routes>
  </BrowserRouter>
  );
};

export default App;
