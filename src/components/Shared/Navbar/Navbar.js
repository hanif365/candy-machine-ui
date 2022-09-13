import React from 'react';
import './Navbar.css';
import { Routes, Route, Link } from "react-router-dom";

const Navbar = () => {
    return (
        <div>
            <nav class="navbar navbar-expand-lg navbar-mint">
                <div class="container-fluid">
                    <Link class="navbar-brand" to="/">Your NFT Name</Link>
                    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNavAltMarkup" aria-controls="navbarNavAltMarkup" aria-expanded="false" aria-label="Toggle navigation">
                        <span class="navbar-toggler-icon"></span>
                    </button>
                    <div class="collapse navbar-collapse" id="navbarNavAltMarkup">
                        <div class="navbar-nav ms-auto">
                            <Link class="nav-link active" aria-current="page" to="/">Home</Link>
                        </div>
                    </div>
                </div>
            </nav>
        </div>
    );
};

export default Navbar;