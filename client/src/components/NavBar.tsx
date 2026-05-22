import { Link } from "react-router-dom";

function NavBar() {
	return (
		<nav className="nav">
			<ul>
				<li>
					<strong>Project- </strong>
				</li>
			</ul>

			<ul>
				<li>
					<Link to="/">Home</Link>
				</li>
				{/* Implement rest of the Links to your routes for the navigation bar.*/}
			</ul>
		</nav>
	);
}
export default NavBar;
