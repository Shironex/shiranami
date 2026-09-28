//! The moved-away guard, on the real filesystem and through an injected probe.

use super::*;

#[test]
fn volume_roots_are_found_for_every_removable_and_network_shape() {
    assert_eq!(
        volume_root("/Volumes/NAS/Music/a.mp3").as_deref(),
        Some("/Volumes/NAS")
    );
    assert_eq!(
        volume_root("/media/kacper/USB/a.mp3").as_deref(),
        Some("/media/kacper/USB")
    );
    assert_eq!(
        volume_root("/run/media/kacper/USB/a.mp3").as_deref(),
        Some("/run/media/kacper/USB")
    );
    assert_eq!(volume_root("/mnt/nas/a.mp3").as_deref(), Some("/mnt/nas"));
    assert_eq!(volume_root(r"D:\Music\a.mp3").as_deref(), Some(r"D:\"));
    assert_eq!(volume_root("e:/Music/a.mp3").as_deref(), Some(r"E:\"));
    assert_eq!(
        volume_root(r"\\nas\music\Album\a.mp3").as_deref(),
        Some(r"\\nas\music\")
    );
    assert_eq!(
        volume_root(r"\\?\UNC\nas\music\a.mp3").as_deref(),
        Some(r"\\nas\music\")
    );
    assert_eq!(volume_root(r"\\?\C:\Music\a.mp3").as_deref(), Some(r"C:\"));
}

#[test]
fn the_system_volume_has_no_separate_root() {
    assert_eq!(volume_root("/Users/me/Music/a.mp3"), None);
    assert_eq!(volume_root("/home/me/a.mp3"), None);
    assert_eq!(volume_root("/Volumes"), None);
}

#[test]
fn a_path_lies_under_a_root_only_on_a_separator_boundary() {
    assert!(lies_under("/music/a.mp3", "/music"));
    assert!(lies_under("/music/a.mp3", "/music/"));
    assert!(lies_under(r"D:\Music\a.mp3", r"D:\Music"));
    assert!(!lies_under("/music-old/a.mp3", "/music"));
    assert!(!lies_under("/a.mp3", "/"));
}

/// A music folder the user keeps music in: it exists and lists an entry.
fn music_folder(dir: &Path) -> String {
    std::fs::write(dir.join("still-here.mp3"), b"x").expect("the fixture writes");
    dir.to_string_lossy().into_owned()
}

#[test]
fn a_file_on_present_storage_that_is_gone_has_moved_away() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let root = music_folder(dir.path());
    let gone = dir.path().join("Album").join("song.mp3");

    assert!(moved_away(
        &gone.to_string_lossy(),
        std::slice::from_ref(&root)
    ));
    assert!(moved_away(&gone.to_string_lossy(), &[] as &[String]));
}

/// The mount point an unmount leaves behind (custom `mount_smbfs` target,
/// autofs, a stale `/Volumes/<name>`): it exists, but it is empty.
#[test]
fn a_file_whose_music_folder_is_an_empty_mount_point_is_offline_not_moved() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let mount_point = dir.path().join("nas");
    std::fs::create_dir_all(&mount_point).expect("the fixture writes");
    let old = mount_point.join("Album").join("song.mp3");

    assert!(!moved_away(
        &old.to_string_lossy(),
        &[mount_point.to_string_lossy().into_owned()]
    ));
}

/// `Path::exists` reads EACCES as "missing"; `try_exists` reports it as an
/// error, and an error is never a move.
#[cfg(unix)]
#[test]
fn a_file_that_cannot_be_statted_for_permission_is_not_moved() {
    use std::os::unix::fs::PermissionsExt;

    let dir = tempfile::tempdir().expect("a temp dir");
    let root = music_folder(dir.path());
    let locked = dir.path().join("locked");
    std::fs::create_dir_all(&locked).expect("the fixture writes");
    let old = locked.join("song.mp3");
    std::fs::write(&old, b"x").expect("the fixture writes");
    std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o000))
        .expect("the fixture locks");

    let moved = moved_away(&old.to_string_lossy(), std::slice::from_ref(&root));

    std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o755))
        .expect("the fixture unlocks");
    assert!(
        old.try_exists().is_ok(),
        "the fixture really was unreadable only while locked"
    );
    assert!(!moved, "EACCES is not a move");
}

#[test]
fn a_file_that_exists_has_not_moved() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let here = dir.path().join("song.mp3");
    std::fs::write(&here, b"x").expect("the fixture writes");

    assert!(!moved_away(&here.to_string_lossy(), &[] as &[String]));
}

/// The offline-NAS case: the watched folder that held the file is itself
/// missing, so its files are unreachable, not moved.
#[test]
fn a_file_whose_music_folder_is_missing_is_offline_not_moved() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let nas = dir.path().join("nas-share");
    let old = nas.join("Album").join("song.mp3");
    let roots = [
        dir.path().to_string_lossy().into_owned(),
        nas.to_string_lossy().into_owned(),
    ];

    assert!(
        !moved_away(&old.to_string_lossy(), &roots),
        "the longest containing root is the missing one"
    );
}

#[test]
fn a_file_on_an_unmounted_volume_is_offline_not_moved() {
    let old = "/Volumes/ShiranamiNoSuchVolume-7f3a/Music/song.mp3";
    assert!(!moved_away(old, &[] as &[String]));
    assert!(!moved_away(
        old,
        &["/Volumes/ShiranamiNoSuchVolume-7f3a/Music"]
    ));
}

/// A probe that answers from a table and counts how often it was asked.
#[derive(Default)]
struct Scripted {
    exists: HashMap<String, io::ErrorKind>,
    missing: HashSet<String>,
    asked: std::cell::Cell<usize>,
}

impl Probe for &Scripted {
    fn exists(&self, path: &Path) -> io::Result<bool> {
        self.asked.set(self.asked.get() + 1);
        let key = path.to_string_lossy().into_owned();
        match self.exists.get(&key) {
            Some(kind) => Err(io::Error::from(*kind)),
            None => Ok(!self.missing.contains(&key)),
        }
    }

    fn has_entries(&self, _path: &Path) -> io::Result<bool> {
        Ok(true)
    }
}

/// A dead share after sleep answers `ETIMEDOUT` or `EIO` rather than "not
/// found". Neither is a move, whether the error comes from the file or from
/// the folder root.
#[test]
fn a_stat_error_on_the_file_or_its_root_is_never_a_move() {
    let roots = ["/share/music"];
    for (failing, kind) in [
        ("/share/music/a.mp3", io::ErrorKind::TimedOut),
        ("/share/music/a.mp3", io::ErrorKind::Other),
        ("/share/music", io::ErrorKind::TimedOut),
    ] {
        let probe = Scripted {
            exists: HashMap::from([(failing.to_owned(), kind)]),
            missing: HashSet::from(["/share/music/a.mp3".to_owned()]),
            ..Scripted::default()
        };
        let mut checker = MovedAway::with_probe(&roots, &probe);

        assert!(
            !checker.check("/share/music/a.mp3"),
            "{kind:?} on {failing} must not read as moved"
        );
    }

    // The control: the same file, definitely not found, on a healthy root.
    let probe = Scripted {
        missing: HashSet::from(["/share/music/a.mp3".to_owned()]),
        ..Scripted::default()
    };
    assert!(MovedAway::with_probe(&roots, &probe).check("/share/music/a.mp3"));
}

/// A hung mount is asked about once per batch, not once per file: after its
/// root fails, no file under it is statted.
#[test]
fn a_failing_root_is_checked_once_and_its_files_are_never_statted() {
    let roots = ["/share/music"];
    let probe = Scripted {
        exists: HashMap::from([("/share/music".to_owned(), io::ErrorKind::TimedOut)]),
        ..Scripted::default()
    };
    let mut checker = MovedAway::with_probe(&roots, &probe);

    for index in 0..50 {
        assert!(!checker.check(&format!("/share/music/{index}.mp3")));
    }

    assert_eq!(probe.asked.get(), 1);
}
