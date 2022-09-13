import React from 'react';
import './HeaderNew.css';
import headerImg from '../../assets/header_back.png';


const HeaderNew = () => {
    return (
        <div>
            <img src={headerImg} alt="" className='headerImg' />
        </div>
    );
};

export default HeaderNew;