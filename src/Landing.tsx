import React from 'react';
import {Routes, Route, useNavigate} from 'react-router-dom';

import landingVideo from './assets/landing_video.mp4';
import mintBtn from './assets/mint_img.png';
import checkStatusBtn from './assets/check_status_img.png';
import followBtn from './assets/follow_img.png';

import './Landing.css'

const Landing = () => {
    const navigate = useNavigate();

    const navigateToMainPage = () => {
        navigate('/main');
      };

    return (
        <div>
            <div className='upperBtnGroup'>
                <img src={followBtn} alt="" className='followButton'/>
                <img src={checkStatusBtn} alt="" className='checkStatusButton' />
            </div>

            <video className='videoImg' autoPlay muted loop>
                <source src={landingVideo} type="video/mp4" />
            </video>

            <div className='mint_btn_div'>
                <img src={mintBtn} onClick={navigateToMainPage} alt="" className='mintBtn' />
            </div>
        </div>
    );
};

export default Landing;